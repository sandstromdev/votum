import { asc, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '#lib/server/db/index.js';
import { readOutcomeSnapshots } from '#lib/server/outcome/snapshot.js';
import { outcomeResolution } from '#lib/server/db/schema/outcome.js';
import {
	decisionVoteConfig,
	selectionOption,
	selectionVoteConfig,
	vote
} from '#lib/server/db/schema/vote.js';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import type { VoteConfiguration } from '#lib/vote/configuration.js';
import type { IncompleteResolution, OutcomeSnapshot } from '#lib/vote/outcome.js';

export type AgendaTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type AgendaExecutor = typeof db | AgendaTransaction;

// The vote foreign keys use RESTRICT, so draft agenda rows must be removed while the meeting
// lock is held and after its participation rows are gone.
export async function deleteAgendaForMeeting(tx: AgendaTransaction, meetingId: string) {
	const votes = await tx.select({ id: vote.id }).from(vote).where(eq(vote.meetingId, meetingId));
	const voteIds = votes.map(({ id }) => id);
	if (voteIds.length === 0) return;

	await tx.update(vote).set({ rerunOfVoteId: null }).where(inArray(vote.id, voteIds));
	await tx.delete(outcomeResolution).where(inArray(outcomeResolution.voteId, voteIds));
	await tx.delete(decisionVoteConfig).where(inArray(decisionVoteConfig.voteId, voteIds));
	await tx.delete(selectionVoteConfig).where(inArray(selectionVoteConfig.voteId, voteIds));
	await tx.delete(selectionOption).where(inArray(selectionOption.voteId, voteIds));
	await tx.delete(vote).where(inArray(vote.id, voteIds));
}

export async function insertVoteConfiguration(
	tx: AgendaTransaction,
	voteId: string,
	input: VoteConfiguration
) {
	if (input.kind === 'decision') {
		await tx.insert(decisionVoteConfig).values({
			voteId,
			...input.decision
		});
		return;
	}

	await tx.insert(selectionVoteConfig).values({
		voteId,
		mode: input.selection.mode,
		positionCount: input.selection.positionCount,
		vacancyEnabled: input.selection.vacancyEnabled
	});
	await tx.insert(selectionOption).values(
		input.selection.optionLabels.map((label, position) => ({
			id: uuidv7(),
			voteId,
			label,
			position
		}))
	);
}

export async function readAgenda(
	executor: AgendaExecutor,
	voteRows: (typeof vote.$inferSelect)[],
	outcomes: Map<string, OutcomeSnapshot> = new Map(),
	resolutions: Map<string, IncompleteResolution> = new Map()
): Promise<OrganizerVote[]> {
	if (voteRows.length === 0) return [];

	const voteIds = voteRows.map((row) => row.id);
	const [decisionRows, selectionRows, optionRows] = await Promise.all([
		executor.select().from(decisionVoteConfig).where(inArray(decisionVoteConfig.voteId, voteIds)),
		executor.select().from(selectionVoteConfig).where(inArray(selectionVoteConfig.voteId, voteIds)),
		executor
			.select()
			.from(selectionOption)
			.where(inArray(selectionOption.voteId, voteIds))
			.orderBy(asc(selectionOption.position))
	]);

	return voteRows.map((row) => {
		if (row.kind === 'decision') {
			const config = decisionRows.find(({ voteId }) => voteId === row.id);
			if (!config) throw new Error('Decision Vote is missing configuration.');
			return {
				id: row.id,
				meetingId: row.meetingId,
				position: row.position,
				title: row.title,
				kind: 'decision',
				lifecycle: row.lifecycle,
				openedAt: row.openedAt,
				closedAt: row.closedAt,
				rerunOfVoteId: row.rerunOfVoteId,
				invalidationReason: row.invalidationReason,
				invalidatedAt: row.invalidatedAt,
				resolution: resolutions.get(row.id) ?? null,
				revealed: row.revealed,
				revealedAt: row.revealedAt,
				publicResultBreakdownEnabled: row.publicResultBreakdownEnabled,
				outcome: outcomes.get(row.id) ?? null,
				decision: {
					supportLabel: config.supportLabel,
					opposeLabel: config.opposeLabel,
					abstentionLabel: config.abstentionLabel,
					majorityRule: config.majorityRule,
					abstentionsCounted: config.abstentionsCounted
				}
			};
		}

		const config = selectionRows.find(({ voteId }) => voteId === row.id);
		if (!config) throw new Error('Selection Vote is missing configuration.');
		return {
			id: row.id,
			meetingId: row.meetingId,
			position: row.position,
			title: row.title,
			kind: 'selection',
			lifecycle: row.lifecycle,
			openedAt: row.openedAt,
			closedAt: row.closedAt,
			rerunOfVoteId: row.rerunOfVoteId,
			invalidationReason: row.invalidationReason,
			invalidatedAt: row.invalidatedAt,
			resolution: resolutions.get(row.id) ?? null,
			revealed: row.revealed,
			revealedAt: row.revealedAt,
			publicResultBreakdownEnabled: row.publicResultBreakdownEnabled,
			outcome: outcomes.get(row.id) ?? null,
			selection: {
				mode: config.mode,
				positionCount: config.positionCount,
				vacancyEnabled: config.vacancyEnabled,
				options: optionRows
					.filter(({ voteId }) => voteId === row.id)
					.map(({ id, label, position }) => ({ id, label, position }))
			}
		};
	});
}

export async function readAgendaForMeeting(executor: AgendaExecutor, meetingId: string) {
	const voteRows = await executor
		.select()
		.from(vote)
		.where(eq(vote.meetingId, meetingId))
		.orderBy(asc(vote.position));
	const voteIds = voteRows.map(({ id }) => id);
	const [outcomes, resolutions] = await Promise.all([
		readOutcomeSnapshots(executor, voteIds),
		readOutcomeResolutions(executor, voteIds)
	]);
	return readAgenda(executor, voteRows, outcomes, resolutions);
}

export async function readAgendaForMeetings(executor: AgendaExecutor, meetingIds: string[]) {
	const agendas = new Map<string, OrganizerVote[]>();
	if (meetingIds.length === 0) return agendas;

	for (const meetingId of meetingIds) agendas.set(meetingId, []);

	const voteRows = await executor
		.select()
		.from(vote)
		.where(inArray(vote.meetingId, meetingIds))
		.orderBy(asc(vote.meetingId), asc(vote.position));
	const voteIds = voteRows.map(({ id }) => id);
	const [outcomes, resolutions] = await Promise.all([
		readOutcomeSnapshots(executor, voteIds),
		readOutcomeResolutions(executor, voteIds)
	]);

	const organizerVotes = await readAgenda(executor, voteRows, outcomes, resolutions);
	for (const organizerVote of organizerVotes) {
		agendas.get(organizerVote.meetingId)?.push(organizerVote);
	}
	return agendas;
}

export async function readOutcomeResolutions(
	executor: AgendaExecutor,
	voteIds: string[]
): Promise<Map<string, IncompleteResolution>> {
	if (voteIds.length === 0) return new Map();
	const rows = await executor
		.select()
		.from(outcomeResolution)
		.where(inArray(outcomeResolution.voteId, voteIds));
	return new Map(
		rows.map(({ voteId, type, resolvedAt }) => [
			voteId,
			{ type, resolvedAt: resolvedAt.toISOString() }
		])
	);
}
