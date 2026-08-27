import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { deleteAgendaForMeeting } from '#lib/server/agenda/persistence.js';
import { isUniqueViolation } from '#lib/server/db/errors.js';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { outcomeSnapshot } from '#lib/server/db/schema/outcome.js';
import { ballot, participantToken } from '#lib/server/db/schema/participation.js';
import { mutateEditableMeeting } from './editable-meeting.js';
import { mapOrganizerMeeting, organizerMeetingColumns } from './projection.js';
import type { MeetingInput, MeetingLifecycleCommand, MeetingSettingsUpdate } from './types.js';

const PUBLIC_LOCATOR_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function createPublicLocator() {
	const bytes = randomBytes(5);
	let buffer = 0;
	let bits = 0;
	let locator = '';

	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			locator += PUBLIC_LOCATOR_ALPHABET[(buffer >>> bits) & 31];
		}
		buffer &= (1 << bits) - 1;
	}

	if (bits > 0) {
		locator += PUBLIC_LOCATOR_ALPHABET[(buffer << (5 - bits)) & 31];
	}

	return locator;
}

export async function createDraftMeeting({
	organizerUserId,
	title,
	expectedParticipantCount
}: MeetingInput) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const publicLocator = createPublicLocator();

		try {
			const [created] = await db
				.insert(meeting)
				.values({
					id: uuidv7(),
					organizerUserId,
					publicLocator,
					title,
					expectedParticipantCount
				})
				.returning(organizerMeetingColumns);

			return mapOrganizerMeeting(created);
		} catch (error) {
			if (!isUniqueViolation(error) || attempt === 2) {
				throw error;
			}
		}
	}

	throw new Error('Meeting creation failed');
}

export async function deleteMeeting({ organizerUserId, meetingId }: MeetingLifecycleCommand) {
	return db.transaction(async (tx) => {
		const [candidate] = await tx
			.select({ id: meeting.id })
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'draft')
				)
			)
			.for('update')
			.limit(1);

		if (!candidate) {
			return false;
		}

		// RESTRICT protects finished history. Drafts are the only meetings whose child rows may be
		// removed here, and the lifecycle check above is the guard.
		await tx.delete(ballot).where(eq(ballot.meetingId, meetingId));
		await tx.delete(outcomeSnapshot).where(eq(outcomeSnapshot.meetingId, meetingId));
		await tx.delete(participantToken).where(eq(participantToken.meetingId, meetingId));
		await deleteAgendaForMeeting(tx, meetingId);

		await tx.delete(meeting).where(and(eq(meeting.id, meetingId), eq(meeting.lifecycle, 'draft')));

		return true;
	});
}

export async function updateMeetingSettings({
	organizerUserId,
	meetingId,
	settings
}: MeetingSettingsUpdate) {
	const updated = await mutateEditableMeeting({
		organizerUserId,
		meetingId,
		mutate: async (tx) => {
			const nextExpectedParticipantCount = settings.expectedParticipantCount;
			const nextPresentationQrEnabled = settings.presentationQrEnabled;

			if (nextExpectedParticipantCount === undefined && nextPresentationQrEnabled === undefined) {
				return { value: true, changed: false };
			}

			const [current] = await tx
				.select({
					expectedParticipantCount: meeting.expectedParticipantCount,
					presentationQrEnabled: meeting.presentationQrEnabled
				})
				.from(meeting)
				.where(eq(meeting.id, meetingId))
				.limit(1);

			if (!current) {
				return { value: false, changed: false };
			}

			const changed =
				(nextExpectedParticipantCount !== undefined &&
					current.expectedParticipantCount !== nextExpectedParticipantCount) ||
				(nextPresentationQrEnabled !== undefined &&
					current.presentationQrEnabled !== nextPresentationQrEnabled);

			if (changed) {
				const updates = {
					...(nextExpectedParticipantCount !== undefined
						? { expectedParticipantCount: nextExpectedParticipantCount }
						: {}),
					...(nextPresentationQrEnabled !== undefined
						? { presentationQrEnabled: nextPresentationQrEnabled }
						: {})
				};

				await tx.update(meeting).set(updates).where(eq(meeting.id, meetingId));
			}

			return { value: true, changed };
		}
	});

	return updated ?? false;
}
