import { and, desc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
	insertVoteConfiguration,
	readAgenda,
	readAgendaForMeeting
} from '#lib/server/agenda/persistence.js';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { outcomeResolution } from '#lib/server/db/schema/outcome.js';
import { vote } from '#lib/server/db/schema/vote.js';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import type { VoteConfiguration } from '#lib/vote/configuration.js';
import { mapOrganizerMeeting, organizerMeetingColumns } from '#lib/server/meeting/projection.js';
import { meetingPubSub } from '#lib/server/pubsub.js';
import type {
	CommittedMeetingResult,
	IncompleteResolutionCommand,
	InvalidateVoteCommand,
	VoteLifecycleCommand
} from '#lib/server/meeting/types.js';
import { readOutcomeSnapshots } from './snapshot.js';

type OutcomeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function meetingIsOpen() {
	return eq(meeting.lifecycle, 'open');
}

async function advanceMeetingAndRead(tx: OutcomeTransaction, meetingId: string) {
	const [updated] = await tx
		.update(meeting)
		.set({ revision: sql`${meeting.revision} + 1` })
		.where(eq(meeting.id, meetingId))
		.returning(organizerMeetingColumns);
	return {
		value: mapOrganizerMeeting(updated, await readAgendaForMeeting(tx, meetingId)),
		revision: updated.revision
	} satisfies CommittedMeetingResult<ReturnType<typeof mapOrganizerMeeting>>;
}

export async function invalidateVote({
	organizerUserId,
	meetingId,
	voteId,
	reason,
	expectedRevision
}: InvalidateVoteCommand) {
	if (!reason.trim()) return null;
	// Lock the meeting before invalidation so it cannot overlap ballot writes, Close, or Reveal.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					meetingIsOpen(),
					...(expectedRevision === undefined ? [] : [eq(meeting.revision, expectedRevision)])
				)
			)
			.for('update')
			.limit(1);
		if (!ownedMeeting) return null;

		const [candidate] = await tx
			.select({ lifecycle: vote.lifecycle, revealed: vote.revealed })
			.from(vote)
			.where(
				and(
					eq(vote.id, voteId),
					eq(vote.meetingId, meetingId),
					sql`${vote.lifecycle} = 'open' OR (${vote.lifecycle} = 'closed' AND ${vote.revealed} = false)`
				)
			)
			.for('update')
			.limit(1);
		if (!candidate) return null;

		await tx
			.update(vote)
			.set({
				lifecycle: 'invalidated',
				invalidationReason: reason,
				invalidatedByUserId: organizerUserId,
				invalidatedAt: new Date()
			})
			.where(eq(vote.id, voteId));

		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed)
		meetingPubSub.publish(meetingId, { kind: 'revision', revision: committed.revision });
	return committed?.value ?? null;
}

function voteToConfiguration(source: OrganizerVote): VoteConfiguration {
	if (source.kind === 'decision') {
		return {
			kind: 'decision',
			title: source.title,
			decision: source.decision
		};
	}

	return {
		kind: 'selection',
		title: source.title,
		selection: {
			mode: source.selection.mode,
			positionCount: source.selection.positionCount,
			vacancyEnabled: source.selection.vacancyEnabled,
			optionLabels: source.selection.options.map(({ label }) => label)
		}
	};
}

export async function rerunVote({
	organizerUserId,
	meetingId,
	voteId,
	expectedRevision
}: VoteLifecycleCommand) {
	// Create reruns only while the meeting is open, so every rerun can use the normal activation flow.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open'),
					...(expectedRevision === undefined ? [] : [eq(meeting.revision, expectedRevision)])
				)
			)
			.for('update')
			.limit(1);
		if (!ownedMeeting) return null;

		const [sourceRow] = await tx
			.select()
			.from(vote)
			.where(
				and(
					eq(vote.id, voteId),
					eq(vote.meetingId, meetingId),
					sql`${vote.lifecycle} IN ('closed', 'invalidated')`
				)
			)
			.for('update')
			.limit(1);
		if (!sourceRow) return null;

		const [activeVote] = await tx
			.select({ id: vote.id })
			.from(vote)
			.where(and(eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'open')))
			.limit(1);
		if (activeVote) return null;

		const [source] = await readAgenda(tx, [sourceRow]);
		if (!source) throw new Error('Rerun source Vote is missing its configuration.');
		const [lastVote] = await tx
			.select({ position: vote.position })
			.from(vote)
			.where(eq(vote.meetingId, meetingId))
			.orderBy(desc(vote.position), desc(vote.id))
			.limit(1);
		const [created] = await tx
			.insert(vote)
			.values({
				id: uuidv7(),
				meetingId,
				position: (lastVote?.position ?? -1) + 1,
				title: source.title,
				kind: source.kind,
				rerunOfVoteId: source.id
			})
			.returning();

		await insertVoteConfiguration(tx, created.id, voteToConfiguration(source));
		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed)
		meetingPubSub.publish(meetingId, { kind: 'revision', revision: committed.revision });
	return committed?.value ?? null;
}

export async function resolveIncompleteVote({
	organizerUserId,
	meetingId,
	voteId,
	resolutionType,
	expectedRevision
}: IncompleteResolutionCommand) {
	// Lock the meeting and closed vote so resolution cannot race Reveal, Rerun, or End. The snapshot
	// stays immutable; only the separate resolution row changes.
	const committed = await db.transaction(async (tx) => {
		const [ownedMeeting] = await tx
			.select(organizerMeetingColumns)
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					eq(meeting.lifecycle, 'open'),
					...(expectedRevision === undefined ? [] : [eq(meeting.revision, expectedRevision)])
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
		if (
			!snapshot ||
			snapshot.document.outcome.kind !== 'selection' ||
			snapshot.document.outcome.state !== 'incomplete'
		)
			return null;
		const [rerun] = await tx
			.select({ id: vote.id })
			.from(vote)
			.where(and(eq(vote.meetingId, meetingId), eq(vote.rerunOfVoteId, voteId)))
			.limit(1);
		if (rerun) return null;

		const resolvedAt = new Date();
		const [existing] = await tx
			.select({ voteId: outcomeResolution.voteId })
			.from(outcomeResolution)
			.where(eq(outcomeResolution.voteId, voteId))
			.limit(1);
		if (existing) {
			await tx
				.update(outcomeResolution)
				.set({ type: resolutionType, resolvedAt })
				.where(eq(outcomeResolution.voteId, voteId));
		} else {
			await tx.insert(outcomeResolution).values({
				voteId,
				meetingId,
				type: resolutionType,
				resolvedAt
			});
		}

		return advanceMeetingAndRead(tx, meetingId);
	});

	if (committed)
		meetingPubSub.publish(meetingId, { kind: 'revision', revision: committed.revision });
	return committed?.value ?? null;
}
