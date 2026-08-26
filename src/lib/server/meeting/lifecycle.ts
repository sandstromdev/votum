import { and, asc, eq, sql } from 'drizzle-orm';
import { readAgenda, readAgendaForMeeting } from '#lib/server/agenda/persistence.js';
import { outcomeResolution, outcomeSnapshot } from '#lib/server/db/schema/outcome.js';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { vote } from '#lib/server/db/schema/vote.js';
import {
	buildOutcomeSnapshotDocument,
	readOutcomeSnapshots,
	readVoteBallots
} from '#lib/server/outcome/snapshot.js';
import { meetingPubSub } from '#lib/server/pubsub.js';
import { mapOrganizerMeeting, organizerMeetingColumns } from './projection.js';
import { readActiveBallotCount } from './queries.js';
import type {
	CommittedMeetingResult,
	MeetingLifecycleCommand,
	PublicResultBreakdownCommand,
	VoteLifecycleCommand
} from './types.js';

type MeetingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function expectedRevisionCondition(expectedRevision: number | undefined) {
	return expectedRevision === undefined ? undefined : [eq(meeting.revision, expectedRevision)];
}

async function advanceMeetingAndRead(tx: MeetingTransaction, meetingId: string) {
	const [updated] = await tx
		.update(meeting)
		.set({ revision: sql`${meeting.revision} + 1` })
		.where(eq(meeting.id, meetingId))
		.returning(organizerMeetingColumns);
	return {
		value: mapOrganizerMeeting(
			updated,
			await readAgendaForMeeting(tx, meetingId),
			await readActiveBallotCount(tx, meetingId)
		),
		revision: updated.revision
	} satisfies CommittedMeetingResult<ReturnType<typeof mapOrganizerMeeting>>;
}

async function activateLockedVote(tx: MeetingTransaction, meetingId: string, voteId: string) {
	await tx.update(vote).set({ lifecycle: 'open', openedAt: new Date() }).where(eq(vote.id, voteId));

	return advanceMeetingAndRead(tx, meetingId);
}

async function hasActiveVote(tx: MeetingTransaction, meetingId: string) {
	const [activeVote] = await tx
		.select({ id: vote.id })
		.from(vote)
		.where(and(eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'open')))
		.limit(1);
	return !!activeVote;
}

export async function openMeeting({
	organizerUserId,
	meetingId,
	expectedRevision
}: MeetingLifecycleCommand) {
	// Lock the meeting so opening cannot race another lifecycle write.
	const committed = await db.transaction(async (tx) => {
		const [draft] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'draft'),
					...(expectedRevisionCondition(expectedRevision) ?? [])
				)
			)
			.for('update')
			.limit(1);

		if (!draft) return null;

		const [opened] = await tx
			.update(meeting)
			.set({
				lifecycle: 'open',
				openedAt: new Date(),
				revision: sql`${meeting.revision} + 1`
			})
			.where(eq(meeting.id, meetingId))
			.returning(organizerMeetingColumns);
		return {
			value: mapOrganizerMeeting(
				opened,
				await readAgendaForMeeting(tx, meetingId),
				await readActiveBallotCount(tx, meetingId)
			),
			revision: opened.revision
		} satisfies CommittedMeetingResult<ReturnType<typeof mapOrganizerMeeting>>;
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}

export async function activateVote({
	organizerUserId,
	meetingId,
	voteId,
	expectedRevision
}: VoteLifecycleCommand) {
	// Use the meeting lock before activation, Close, and End.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open'),
					...(expectedRevisionCondition(expectedRevision) ?? [])
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting || (await hasActiveVote(tx, meetingId))) return null;

		const [draftVote] = await tx
			.select()
			.from(vote)
			.where(and(eq(vote.id, voteId), eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'draft')))
			.for('update')
			.limit(1);

		if (!draftVote) return null;
		await readAgenda(tx, [draftVote]);

		return activateLockedVote(tx, meetingId, draftVote.id);
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}

export async function activateNextVote({
	organizerUserId,
	meetingId,
	expectedRevision
}: MeetingLifecycleCommand) {
	// The meeting lock makes "next" deterministic when two organizer pages act at once.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open'),
					...(expectedRevisionCondition(expectedRevision) ?? [])
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting || (await hasActiveVote(tx, meetingId))) return null;

		const [nextVote] = await tx
			.select()
			.from(vote)
			.where(and(eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'draft')))
			.orderBy(asc(vote.position), asc(vote.id))
			.for('update')
			.limit(1);

		if (!nextVote) return null;
		await readAgenda(tx, [nextVote]);

		return activateLockedVote(tx, meetingId, nextVote.id);
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}

export async function closeVote({ organizerUserId, meetingId, voteId }: VoteLifecycleCommand) {
	// Ballot writes hold shared key locks on the Meeting and active Vote. Taking both rows in update
	// mode, in the same order, makes this transaction the close boundary for committed Ballots.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open')
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting) return null;

		const [activeVote] = await tx
			.select()
			.from(vote)
			.where(and(eq(vote.id, voteId), eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'open')))
			.for('update')
			.limit(1);

		if (!activeVote) return null;
		const [organizerVote] = await readAgenda(tx, [activeVote]);
		if (!organizerVote) throw new Error('Active Vote is missing its configuration.');
		const closedAt = new Date();
		const document = await buildOutcomeSnapshotDocument({
			vote: organizerVote,
			ballots: await readVoteBallots(tx, activeVote.id),
			expectedParticipantCount: ownedMeeting.expectedParticipantCount,
			closedAt
		});

		await tx.insert(outcomeSnapshot).values({
			voteId: activeVote.id,
			meetingId,
			document,
			createdAt: closedAt
		});

		await tx.update(vote).set({ lifecycle: 'closed', closedAt }).where(eq(vote.id, activeVote.id));
		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}

export async function revealVote({ organizerUserId, meetingId, voteId }: VoteLifecycleCommand) {
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					// Reveal is allowed after the meeting ends. The closed vote controls disclosure.
					inLifecycle()
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting) return null;
		const [closedVote] = await tx
			.select({ id: vote.id, revealed: vote.revealed })
			.from(vote)
			.where(and(eq(vote.id, voteId), eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'closed')))
			.for('update')
			.limit(1);
		if (!closedVote || closedVote.revealed) return null;

		const snapshot = (await readOutcomeSnapshots(tx, [voteId])).get(voteId);
		if (!snapshot) return null;
		if (
			snapshot.document.outcome.kind === 'selection' &&
			snapshot.document.outcome.state === 'incomplete'
		) {
			const [resolution] = await tx
				.select({ voteId: outcomeResolution.voteId })
				.from(outcomeResolution)
				.where(eq(outcomeResolution.voteId, voteId))
				.limit(1);
			if (!resolution) return null;
		}

		await tx
			.update(vote)
			.set({ revealed: true, revealedAt: new Date() })
			.where(eq(vote.id, voteId));
		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}

export async function setPublicResultBreakdown({
	organizerUserId,
	meetingId,
	voteId,
	enabled
}: PublicResultBreakdownCommand) {
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open')
				)
			)
			.for('update')
			.limit(1);
		if (!ownedMeeting) return null;

		const [closedVote] = await tx
			.select({
				id: vote.id,
				revealed: vote.revealed,
				publicResultBreakdownEnabled: vote.publicResultBreakdownEnabled
			})
			.from(vote)
			.where(and(eq(vote.id, voteId), eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'closed')))
			.for('update')
			.limit(1);
		if (!closedVote || !closedVote.revealed) return null;
		if (closedVote.publicResultBreakdownEnabled === enabled) {
			return {
				value: mapOrganizerMeeting(
					ownedMeeting,
					await readAgendaForMeeting(tx, meetingId),
					await readActiveBallotCount(tx, meetingId)
				),
				revision: null
			} satisfies CommittedMeetingResult<ReturnType<typeof mapOrganizerMeeting>>;
		}

		await tx.update(vote).set({ publicResultBreakdownEnabled: enabled }).where(eq(vote.id, voteId));
		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed && committed.revision !== null) {
		meetingPubSub.publish(meetingId, committed.revision);
	}
	return committed?.value ?? null;
}

function inLifecycle() {
	return sql`${meeting.lifecycle} IN ('open', 'closed')`;
}

export async function endMeeting({
	organizerUserId,
	meetingId,
	expectedRevision
}: MeetingLifecycleCommand) {
	// The meeting lock and active-vote check make ending terminal relative to activation.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open'),
					...(expectedRevisionCondition(expectedRevision) ?? [])
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting) return null;

		const [activeVote] = await tx
			.select({ id: vote.id })
			.from(vote)
			.where(and(eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'open')))
			.limit(1);
		if (activeVote) return null;

		const agenda = await readAgendaForMeeting(tx, meetingId);
		const hasUnresolvedIncompleteVote = agenda.some(
			(candidate) =>
				candidate.lifecycle === 'closed' &&
				candidate.outcome?.document.outcome.kind === 'selection' &&
				candidate.outcome.document.outcome.state === 'incomplete' &&
				!candidate.resolution &&
				!agenda.some((child) => child.rerunOfVoteId === candidate.id)
		);
		if (hasUnresolvedIncompleteVote) return null;

		const [ended] = await tx
			.update(meeting)
			.set({ lifecycle: 'closed', closedAt: new Date(), revision: sql`${meeting.revision} + 1` })
			.where(eq(meeting.id, meetingId))
			.returning(organizerMeetingColumns);
		return {
			value: mapOrganizerMeeting(
				ended,
				await readAgendaForMeeting(tx, meetingId),
				await readActiveBallotCount(tx, meetingId)
			),
			revision: ended.revision
		} satisfies CommittedMeetingResult<ReturnType<typeof mapOrganizerMeeting>>;
	});

	if (committed) meetingPubSub.publish(meetingId, committed.revision);
	return committed?.value ?? null;
}
