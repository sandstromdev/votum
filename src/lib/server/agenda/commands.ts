import { and, asc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { DraftVoteInput, UpdateDraftVoteInput } from '#lib/schemas/vote.js';
import {
	decisionVoteConfig,
	selectionOption,
	selectionVoteConfig,
	vote
} from '#lib/server/db/schema/vote.js';
import { mutateEditableMeeting } from '#lib/server/meeting/editable-meeting.js';
import { draftInputToVoteConfiguration } from '#lib/vote/configuration.js';
import type {
	OrganizerCommand,
	RemoveDraftVoteCommand,
	ReorderDraftVotesCommand
} from './types.js';
import { insertVoteConfiguration, readAgenda } from './persistence.js';
import { decideDraftReorder, nextAgendaPosition } from './transition.js';

export async function addDraftVote(input: OrganizerCommand & DraftVoteInput) {
	const configuration = draftInputToVoteConfiguration(input);
	return mutateEditableMeeting({
		organizerUserId: input.organizerUserId,
		meetingId: input.meetingId,
		mutate: async (tx) => {
			const rows = await tx
				.select({ position: vote.position })
				.from(vote)
				.where(eq(vote.meetingId, input.meetingId))
				.orderBy(sql`${vote.position} DESC`);
			const position = nextAgendaPosition(rows);
			const [created] = await tx
				.insert(vote)
				.values({
					id: uuidv7(),
					meetingId: input.meetingId,
					position,
					title: input.title,
					kind: input.kind
				})
				.returning();

			await insertVoteConfiguration(tx, created.id, configuration);
			return { value: (await readAgenda(tx, [created]))[0], changed: true };
		}
	});
}

export async function editDraftVote(input: OrganizerCommand & UpdateDraftVoteInput) {
	const configuration = draftInputToVoteConfiguration(input);
	return mutateEditableMeeting({
		organizerUserId: input.organizerUserId,
		meetingId: input.meetingId,
		mutate: async (tx) => {
			// The meeting lock prevents an open vote from seeing a half-replaced configuration.
			const [existing] = await tx
				.select()
				.from(vote)
				.where(
					and(
						eq(vote.id, input.voteId),
						eq(vote.meetingId, input.meetingId),
						eq(vote.lifecycle, 'draft')
					)
				)
				.limit(1);
			if (!existing) return { value: null, changed: false };

			await tx.delete(decisionVoteConfig).where(eq(decisionVoteConfig.voteId, existing.id));
			await tx.delete(selectionVoteConfig).where(eq(selectionVoteConfig.voteId, existing.id));
			await tx.delete(selectionOption).where(eq(selectionOption.voteId, existing.id));
			const [updated] = await tx
				.update(vote)
				.set({ title: input.title, kind: input.kind })
				.where(eq(vote.id, existing.id))
				.returning();

			await insertVoteConfiguration(tx, updated.id, configuration);
			return { value: (await readAgenda(tx, [updated]))[0], changed: true };
		}
	});
}

export async function saveDraftVote(input: OrganizerCommand & DraftVoteInput) {
	return input.voteId ? editDraftVote({ ...input, voteId: input.voteId }) : addDraftVote(input);
}

export async function removeDraftVote({
	organizerUserId,
	meetingId,
	voteId
}: RemoveDraftVoteCommand) {
	const removed = await mutateEditableMeeting({
		organizerUserId,
		meetingId,
		mutate: async (tx) => {
			const rows = await tx
				.delete(vote)
				.where(and(eq(vote.id, voteId), eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'draft')))
				.returning({ id: vote.id });

			return { value: rows.length > 0, changed: rows.length > 0 };
		}
	});

	return removed ?? false;
}

export async function reorderDraftVotes({
	organizerUserId,
	meetingId,
	orderedVoteIds
}: ReorderDraftVotesCommand) {
	const reordered = await mutateEditableMeeting({
		organizerUserId,
		meetingId,
		mutate: async (tx) => {
			const rows = await tx
				.select({ id: vote.id, position: vote.position, lifecycle: vote.lifecycle })
				.from(vote)
				.where(eq(vote.meetingId, meetingId))
				.orderBy(asc(vote.position));
			const decision = decideDraftReorder(rows, orderedVoteIds);
			if (decision.kind === 'invalid') return { value: false, changed: false };
			if (decision.kind === 'unchanged') return { value: true, changed: false };

			// Use temporary positions so the unique index does not collide while rows swap slots.
			for (const [index, row] of decision.draftRows.entries()) {
				await tx
					.update(vote)
					.set({ position: decision.temporaryOffset + index })
					.where(eq(vote.id, row.id));
			}
			for (const [index, voteId] of orderedVoteIds.entries()) {
				await tx
					.update(vote)
					.set({ position: decision.draftRows[index].position })
					.where(eq(vote.id, voteId));
			}

			return { value: true, changed: true };
		}
	});

	return reordered ?? false;
}
