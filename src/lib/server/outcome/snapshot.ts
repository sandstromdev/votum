import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { ballot } from '#lib/server/db/schema/participation.js';
import { outcomeSnapshot } from '#lib/server/db/schema/outcome.js';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import { DECISION_BALLOT_CHOICES } from '#lib/vote/ballot.js';
import type {
	DecisionCounts,
	DecisionOutcome,
	OutcomeSnapshot,
	OutcomeSnapshotDocument,
	SelectionCounts,
	SelectionOutcome,
	SelectionSnapshotOption
} from '#lib/vote/outcome.js';
import { OUTCOME_SNAPSHOT_VERSION } from '#lib/vote/outcome.js';
import type { DecisionMajorityConfiguration } from '#lib/vote/majority.js';
import { storedBallotPayloadSchema } from '#lib/server/ballot/payload.js';
import type { BallotTransaction } from '#lib/server/ballot/types.js';

type OutcomeExecutor = Pick<BallotTransaction, 'select'>;

const decisionChoiceSchema = z.enum(DECISION_BALLOT_CHOICES);
const optionSchema = z.object({ id: z.string(), label: z.string(), position: z.number().int() });
const decisionCountsSchema = z.object({
	support: z.number().int().nonnegative(),
	oppose: z.number().int().nonnegative(),
	abstention: z.number().int().nonnegative()
});
const selectionVoteSchema = z.object({
	kind: z.literal('selection'),
	title: z.string(),
	selection: z.object({
		mode: z.enum(['single', 'multiple']),
		positionCount: z.number().int().positive(),
		vacancyEnabled: z.boolean(),
		options: z.array(optionSchema)
	})
});
const selectionCountsSchema = z.object({
	options: z.array(optionSchema.extend({ count: z.number().int().nonnegative() })),
	vacancy: z.number().int().nonnegative(),
	abstention: z.number().int().nonnegative()
});
const selectionPositionSchema = z.union([
	z.object({ type: z.literal('option'), id: z.string(), label: z.string() }),
	z.object({ type: z.literal('vacancy'), source: z.enum(['participant', 'organizer']) }),
	z.object({ type: z.literal('unresolved') })
]);
const selectionWinnerSchema = z.union([
	z.object({ type: z.literal('option'), id: z.string(), label: z.string() }),
	z.object({ type: z.literal('vacancy') }),
	z.object({
		type: z.literal('options'),
		options: z.array(z.object({ id: z.string(), label: z.string() }))
	}),
	z.object({ type: z.literal('positions'), positions: z.array(selectionPositionSchema) })
]);
const decisionVoteSchema = z.object({
	kind: z.literal('decision'),
	title: z.string(),
	decision: z.object({
		supportLabel: z.string(),
		opposeLabel: z.string(),
		abstentionLabel: z.string(),
		majorityRule: z.enum(['simple', 'qualified']),
		abstentionsCounted: z.boolean()
	})
});
const decisionOutcomeSchema = z.union([
	z.object({
		kind: z.literal('decision'),
		state: z.literal('winner'),
		winner: decisionChoiceSchema
	}),
	z.object({
		kind: z.literal('decision'),
		state: z.literal('tie'),
		winner: z.null(),
		tied: z.array(decisionChoiceSchema)
	}),
	z.object({ kind: z.literal('decision'), state: z.literal('no-result'), winner: z.null() }),
	z.object({ kind: z.literal('decision'), state: z.literal('rejected'), winner: z.null() })
]);
const selectionOutcomeSchema = z.union([
	z.object({
		kind: z.literal('selection'),
		state: z.literal('winner'),
		winner: selectionWinnerSchema
	}),
	z.object({
		kind: z.literal('selection'),
		state: z.literal('tie'),
		winner: z.null(),
		tied: z.array(z.object({ id: z.string(), label: z.string() }))
	}),
	z.object({
		kind: z.literal('selection'),
		state: z.literal('incomplete'),
		winner: z.object({ type: z.literal('positions'), positions: z.array(selectionPositionSchema) })
	}),
	z.object({ kind: z.literal('selection'), state: z.literal('no-result'), winner: z.null() })
]);
const outcomeDocumentBase = {
	closedAt: z.string(),
	expectedParticipantCount: z.number().int().positive().nullable(),
	ballotCount: z.number().int().nonnegative()
};
const outcomeDocumentSchema = z.union([
	z.object({
		...outcomeDocumentBase,
		version: z.literal(OUTCOME_SNAPSHOT_VERSION),
		vote: decisionVoteSchema,
		counts: decisionCountsSchema,
		outcome: decisionOutcomeSchema
	}),
	z.object({
		...outcomeDocumentBase,
		version: z.literal(OUTCOME_SNAPSHOT_VERSION),
		vote: selectionVoteSchema,
		counts: selectionCountsSchema,
		outcome: selectionOutcomeSchema
	})
]);

function parseOutcomeDocument(value: unknown): OutcomeSnapshotDocument {
	return outcomeDocumentSchema.parse(typeof value === 'string' ? JSON.parse(value) : value);
}

function emptyDecisionCounts(): DecisionCounts {
	return { support: 0, oppose: 0, abstention: 0 };
}

function getDecisionOutcome(
	counts: DecisionCounts,
	majority: DecisionMajorityConfiguration
): DecisionOutcome {
	if (counts.support === 0 && counts.oppose === 0) {
		return { state: 'no-result', winner: null };
	}
	if (counts.support === counts.oppose) {
		return { state: 'tie', winner: null, tied: ['support', 'oppose'] };
	}
	if (majority.majorityRule === 'simple' && counts.support > counts.oppose) {
		return { state: 'winner', winner: 'support' };
	}
	if (majority.majorityRule === 'qualified') {
		const denominator =
			counts.support + counts.oppose + (majority.abstentionsCounted ? counts.abstention : 0);

		if (3 * counts.support >= 2 * denominator) {
			return { state: 'winner', winner: 'support' };
		}
	}

	return { state: 'rejected', winner: null };
}

function getSelectionOutcome(
	counts: SelectionCounts,
	positionCount: number,
	vacancyEnabled: boolean,
	mode: 'single' | 'multiple'
): SelectionOutcome {
	const regular = counts.options.filter(({ count }) => count > 0);

	if (mode === 'single') {
		const regularMax = Math.max(...regular.map(({ count }) => count), 0);

		if (regularMax === 0 && (!vacancyEnabled || counts.vacancy === 0)) {
			return { state: 'no-result', winner: null };
		}

		if (vacancyEnabled && counts.vacancy > regularMax) {
			return { state: 'winner', winner: { type: 'vacancy' } };
		}

		const leaders = regular.filter(({ count }) => count === regularMax);

		if (leaders.length === 1) {
			const leader = leaders[0];

			if (leader) {
				return {
					state: 'winner',
					winner: {
						type: 'option',
						id: leader.id,
						label: leader.label
					}
				};
			}
		}

		return {
			state: 'tie',
			winner: null,
			tied: leaders.map(({ id, label }) => ({ id, label }))
		};
	}

	// For multiple positions, vote count wins and the configured option position breaks ties.
	const remaining = [...regular].toSorted(
		(left, right) => right.count - left.count || left.position - right.position
	);

	const positions: Array<
		| { type: 'option'; id: string; label: string }
		| { type: 'vacancy'; source: 'participant' }
		| { type: 'unresolved' }
	> = [];

	let remainingVacancies = vacancyEnabled ? Math.min(counts.vacancy, positionCount) : 0;

	for (let index = 0; index < positionCount; index += 1) {
		const regularCount = remaining[0]?.count ?? 0;
		const vacancyCount = remainingVacancies > 0 ? counts.vacancy : 0;

		if (regularCount === 0 && vacancyCount === 0) {
			positions.push({ type: 'unresolved' });
			continue;
		}

		if (regularCount >= vacancyCount) {
			const tied = remaining.filter(({ count }) => count === regularCount);

			if (tied.length > positionCount - index) {
				return {
					state: 'tie',
					winner: null,
					tied: tied.map(({ id, label }) => ({ id, label }))
				};
			}

			const winner = remaining.shift();

			if (!winner) {
				throw new Error('Selection winner disappeared while counting.');
			}

			positions.push({ type: 'option', id: winner.id, label: winner.label });

			continue;
		}

		positions.push({ type: 'vacancy', source: 'participant' });

		remainingVacancies -= 1;
	}

	const resolvedPositions = positions.filter(({ type }) => type !== 'unresolved');

	if (resolvedPositions.length === 0) {
		return { state: 'no-result', winner: null };
	}

	if (positions.some(({ type }) => type === 'unresolved')) {
		return { state: 'incomplete', winner: { type: 'positions', positions } };
	}

	const regularWinners = positions.filter(
		(position): position is { type: 'option'; id: string; label: string } =>
			position.type === 'option'
	);

	if (regularWinners.length === positionCount) {
		if (regularWinners.length === 1) {
			const [winner] = regularWinners;

			if (winner) {
				return { state: 'winner', winner };
			}
		}

		return {
			state: 'winner',
			winner: {
				type: 'options',
				options: regularWinners.map(({ id, label }) => ({ id, label }))
			}
		};
	}

	if (regularWinners.length === 0) {
		return { state: 'winner', winner: { type: 'vacancy' } };
	}

	return { state: 'winner', winner: { type: 'positions', positions } };
}

export function buildOutcomeSnapshotDocument({
	vote,
	ballots,
	expectedParticipantCount,
	closedAt
}: {
	vote: OrganizerVote;
	ballots: unknown[];
	expectedParticipantCount: number | null;
	closedAt: Date;
}): OutcomeSnapshotDocument {
	const parsedBallots = ballots.map((payload) => storedBallotPayloadSchema.parse(payload));

	if (vote.kind === 'decision') {
		const counts = emptyDecisionCounts();

		for (const parsedBallot of parsedBallots) {
			if (parsedBallot.type !== 'decision') {
				throw new Error('Decision Vote contains a Selection Ballot.');
			}
			counts[parsedBallot.choice] += 1;
		}

		return {
			version: OUTCOME_SNAPSHOT_VERSION,
			vote: { kind: 'decision', title: vote.title, decision: vote.decision },
			closedAt: closedAt.toISOString(),
			expectedParticipantCount,
			ballotCount: parsedBallots.length,
			counts,
			outcome: { kind: 'decision', ...getDecisionOutcome(counts, vote.decision) }
		};
	}

	const optionCounts = vote.selection.options.map(
		(option): SelectionSnapshotOption & { count: number } => ({
			...option,
			count: 0
		})
	);

	const optionById = new Map(optionCounts.map((option) => [option.id, option]));

	let vacancy = 0;
	let abstention = 0;

	for (const parsedBallot of parsedBallots) {
		if (parsedBallot.type !== 'selection') {
			throw new Error('Selection Vote contains a Decision Ballot.');
		}

		if (parsedBallot.abstain) {
			abstention += 1;
			continue;
		}

		for (const optionId of parsedBallot.selectedOptionIds) {
			const option = optionById.get(optionId);

			if (!option) {
				throw new Error('Selection Ballot references an option from another Vote.');
			}

			option.count += 1;
		}

		vacancy += parsedBallot.vacancyCount;
	}

	const counts: SelectionCounts = { options: optionCounts, vacancy, abstention };

	return {
		version: OUTCOME_SNAPSHOT_VERSION,
		vote: {
			kind: 'selection',
			title: vote.title,
			selection: {
				mode: vote.selection.mode,
				positionCount: vote.selection.positionCount,
				vacancyEnabled: vote.selection.vacancyEnabled,
				options: vote.selection.options
			}
		},
		closedAt: closedAt.toISOString(),
		expectedParticipantCount,
		ballotCount: parsedBallots.length,
		counts,
		outcome: {
			kind: 'selection',
			...getSelectionOutcome(
				counts,
				vote.selection.positionCount,
				vote.selection.vacancyEnabled,
				vote.selection.mode
			)
		}
	};
}

export async function readOutcomeSnapshots(
	executor: OutcomeExecutor,
	voteIds: string[]
): Promise<Map<string, OutcomeSnapshot>> {
	if (voteIds.length === 0) {
		return new Map();
	}
	const rows = await executor
		.select()
		.from(outcomeSnapshot)
		.where(inArray(outcomeSnapshot.voteId, voteIds));

	return new Map(
		rows.map((row) => [
			row.voteId,
			{
				voteId: row.voteId,
				meetingId: row.meetingId,
				document: parseOutcomeDocument(row.document),
				createdAt: row.createdAt
			}
		])
	);
}

export async function readVoteBallots(executor: OutcomeExecutor, voteId: string) {
	const rows = await executor
		.select({ payload: ballot.payload })
		.from(ballot)
		.where(eq(ballot.voteId, voteId));

	return rows.map(({ payload }) => payload);
}
