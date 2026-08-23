import { command, form, getRequestEvent, query } from '$app/server';
import { error, invalid, redirect } from '@sveltejs/kit';
import { createMeetingSchema, updateMeetingSettingsSchema } from '#lib/schemas/meeting.js';
import {
	activateNextVote as activateNextVoteRecord,
	activateVote as activateVoteRecord,
	createDraftMeeting as createDraftMeetingRecord,
	closeVote as closeVoteRecord,
	deleteMeeting as deleteMeetingRecord,
	endMeeting as endMeetingRecord,
	getOrganizerMeetingByLocator as getOrganizerMeetingByLocatorRecord,
	getParticipantMeetingId,
	getParticipantPageProjection,
	getPresentationProjection,
	listOrganizerMeetings,
	invalidateVote as invalidateVoteRecord,
	openMeeting as openMeetingRecord,
	revealVote as revealVoteRecord,
	rerunVote as rerunVoteRecord,
	resolveIncompleteVote as resolveIncompleteVoteRecord,
	setPublicResultBreakdown as setPublicResultBreakdownRecord,
	updateMeetingSettings as updateMeetingSettingsRecord
} from '#lib/server/meeting/index.js';
import { requireOrganizerSession } from '#lib/server/auth/session.js';
import { getParticipantToken } from '#lib/server/participant-token.js';
import {
	liveMeetingSnapshots,
	readOwnedMeetingIdByLocator
} from '#lib/server/meeting/live-updates.js';
import {
	meetingLifecycleCommandSchema,
	meetingLocatorQuerySchema,
	presentationQrVisibilitySchema,
	voteLifecycleCommandSchema
} from './meeting-inputs.js';
import z from 'zod';

export const participantMeeting = query(meetingLocatorQuerySchema, async ({ publicLocator }) => {
	const event = getRequestEvent();
	return getParticipantPageProjection(publicLocator, getParticipantToken(event, publicLocator));
});

export const participantMeetingLive = query.live(
	meetingLocatorQuerySchema,
	async function* ({ publicLocator }) {
		const event = getRequestEvent();
		const rawParticipantToken = getParticipantToken(event, publicLocator);
		const meetingId = await getParticipantMeetingId(publicLocator);

		if (!meetingId) {
			yield { state: 'invalid' as const, message: 'Möteslänken kunde inte hittas.' };
			return;
		}

		yield* liveMeetingSnapshots(
			meetingId,
			() => getParticipantPageProjection(publicLocator, rawParticipantToken),
			event.request.signal
		);
	}
);

export const presentationMeeting = query(meetingLocatorQuerySchema, async ({ publicLocator }) =>
	getPresentationProjection(publicLocator)
);

export const presentationMeetingLive = query.live(
	meetingLocatorQuerySchema,
	async function* ({ publicLocator }) {
		const event = getRequestEvent();
		const meetingId = await getParticipantMeetingId(publicLocator);

		if (!meetingId) {
			yield { state: 'invalid' as const, message: 'Möteslänken kunde inte hittas.' };
			return;
		}

		yield* liveMeetingSnapshots(
			meetingId,
			() => getPresentationProjection(publicLocator),

			event.request.signal
		);
	}
);

export const organizerMeetingLive = query.live(
	meetingLocatorQuerySchema,
	async function* ({ publicLocator }) {
		const event = getRequestEvent();
		const { user } = requireOrganizerSession();
		const meetingId = await readOwnedMeetingIdByLocator(user.id, publicLocator);
		if (!meetingId) error(404, 'Mötet kunde inte hittas.');

		yield* liveMeetingSnapshots(
			meetingId,
			async () => {
				const meeting = await getOrganizerMeetingByLocatorRecord({
					organizerUserId: user.id,
					publicLocator
				});
				if (!meeting) error(404, 'Mötet kunde inte hittas.');
				return meeting;
			},
			event.request.signal
		);
	}
);

export const createDraftMeeting = form(createMeetingSchema, async (input) => {
	const { user } = requireOrganizerSession();

	const created = await createDraftMeetingRecord({
		organizerUserId: user.id,
		...input,
		expectedParticipantCount: input.expectedParticipantCount ?? null
	});

	getOrganizerMeetings().refresh();

	redirect(303, `/organisera/${created.publicLocator}`);
});

export const updateMeetingSettings = form(updateMeetingSettingsSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const updated = await updateMeetingSettingsRecord({
		organizerUserId: user.id,
		meetingId: input.meetingId,
		settings: {
			expectedParticipantCount: input.expectedParticipantCount ?? null
		}
	});

	if (!updated) invalid('Mötet kunde inte hittas.');

	getOrganizerMeetings().refresh();

	return { success: true };
});

export const setPresentationQrEnabled = command(
	presentationQrVisibilitySchema,
	async ({ meetingId, enabled }) => {
		const { user } = requireOrganizerSession();
		const updated = await updateMeetingSettingsRecord({
			organizerUserId: user.id,
			meetingId,
			settings: { presentationQrEnabled: enabled }
		});
		if (!updated) error(409, 'QR-koden kan inte ändras i det här läget.');
		getOrganizerMeetings().refresh();
	}
);

export const getOrganizerMeetings = query(async () => {
	const { user } = requireOrganizerSession();

	const meetings = await listOrganizerMeetings(user.id);

	return meetings;
});

export const getOrganizerMeetingByLocator = query(
	meetingLocatorQuerySchema,
	async ({ publicLocator }) => {
		const { user } = requireOrganizerSession();
		const meeting = await getOrganizerMeetingByLocatorRecord({
			organizerUserId: user.id,
			publicLocator
		});
		if (!meeting) error(404, 'Mötet kunde inte hittas.');
		return meeting;
	}
);

export const openMeeting = command(meetingLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();

	const opened = await openMeetingRecord({ organizerUserId: user.id, ...input });

	if (!opened) error(409, 'Mötet kan inte öppnas i det här läget.');

	getOrganizerMeetings().refresh();
});

export const activateVote = command(voteLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const activated = await activateVoteRecord({ organizerUserId: user.id, ...input });
	if (!activated) error(409, 'Omröstningen kan inte aktiveras i det här läget.');
	getOrganizerMeetings().refresh();
});

export const activateNextVote = command(meetingLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const activated = await activateNextVoteRecord({ organizerUserId: user.id, ...input });
	if (!activated) error(409, 'Det finns ingen omröstning som kan aktiveras nu.');
	getOrganizerMeetings().refresh();
});

export const closeVote = command(voteLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const closed = await closeVoteRecord({ organizerUserId: user.id, ...input });
	if (!closed) error(409, 'Omröstningen kan inte stängas i det här läget.');
	getOrganizerMeetings().refresh();
});

export const revealVote = command(voteLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const revealed = await revealVoteRecord({ organizerUserId: user.id, ...input });
	if (!revealed) error(409, 'Resultatet kan inte visas i det här läget.');
	getOrganizerMeetings().refresh();
});

export const invalidateVote = command(
	voteLifecycleCommandSchema.extend({
		reason: z
			.string()
			.trim()
			.min(1, 'Skriv varför omröstningen ska ogiltigförklaras.')
			.max(1000, 'Anledningen får vara högst 1000 tecken.')
	}),
	async (input) => {
		const { user } = requireOrganizerSession();
		const invalidated = await invalidateVoteRecord({ organizerUserId: user.id, ...input });
		if (!invalidated) error(409, 'Omröstningen kan inte ogiltigförklaras i det här läget.');
		getOrganizerMeetings().refresh();
	}
);

export const rerunVote = command(voteLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const rerun = await rerunVoteRecord({ organizerUserId: user.id, ...input });
	if (!rerun) error(409, 'Omröstningen kan inte göras om i det här läget.');
	getOrganizerMeetings().refresh();
});

export const resolveIncompleteVote = command(
	voteLifecycleCommandSchema.extend({
		resolutionType: z.enum(['accept', 'vacancy'])
	}),
	async (input) => {
		const { user } = requireOrganizerSession();
		const resolved = await resolveIncompleteVoteRecord({ organizerUserId: user.id, ...input });
		if (!resolved) error(409, 'Det inkompletta resultatet kan inte ändras i det här läget.');
		getOrganizerMeetings().refresh();
	}
);

export const setPublicResultBreakdown = command(
	voteLifecycleCommandSchema.extend({ enabled: z.boolean() }),
	async (input) => {
		const { user } = requireOrganizerSession();
		const updated = await setPublicResultBreakdownRecord({ organizerUserId: user.id, ...input });
		if (!updated) error(409, 'Resultatöversikten kan inte ändras i det här läget.');
		getOrganizerMeetings().refresh();
	}
);

export const endMeeting = command(meetingLifecycleCommandSchema, async (input) => {
	const { user } = requireOrganizerSession();
	const ended = await endMeetingRecord({ organizerUserId: user.id, ...input });
	if (!ended) error(409, 'Mötet kan inte avslutas i det här läget.');
	getOrganizerMeetings().refresh();
});

export const deleteMeeting = command(meetingLifecycleCommandSchema, async ({ meetingId }) => {
	const { user } = requireOrganizerSession();
	const deleted = await deleteMeetingRecord({ organizerUserId: user.id, meetingId });
	if (!deleted) error(409, 'Du kan bara ta bort möten som inte har öppnats.');
	getOrganizerMeetings().refresh();
});
