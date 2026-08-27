import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import {
	readAgenda,
	readAgendaForMeeting,
	readAgendaForMeetings,
	readOutcomeResolutions
} from '#lib/server/agenda/persistence.js';
import type { AgendaExecutor } from '#lib/server/agenda/persistence.js';
import { readOutcomeSnapshots } from '#lib/server/outcome/snapshot.js';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { ballot } from '#lib/server/db/schema/participation.js';
import { vote } from '#lib/server/db/schema/vote.js';
import { readCurrentParticipantBallot } from '#lib/server/ballot/index.js';
import {
	INVALID_MEETING_MESSAGE,
	mapOrganizerMeeting,
	organizerMeetingColumns
} from './projection.js';
import type {
	ParticipantPageProjection,
	ParticipantProjection,
	PresentationProjection
} from '#lib/vote/meeting.js';
import {
	applyIncompleteResolution,
	type PublicOutcome,
	type PublicVoteResult,
	type SelectionWinner
} from '#lib/vote/outcome.js';
import { majorityRequirement, majorityRuleLabel } from '#lib/vote/majority.js';
import { createActiveVoteKey } from './active-vote-key.js';
import {
	recordParticipantTokenAnomalyBestEffort,
	type ParticipantTokenAnomalyInput
} from '#lib/server/ballot/diagnostics.js';

function participantDecisionLabels(decision: {
	supportLabel: string;
	opposeLabel: string;
	abstentionLabel: string;
}) {
	return {
		supportLabel: decision.supportLabel,
		opposeLabel: decision.opposeLabel,
		abstentionLabel: decision.abstentionLabel
	};
}

export async function readActiveBallotCounts(executor: AgendaExecutor, meetingIds: string[]) {
	if (meetingIds.length === 0) {
		return new Map<string, number>();
	}

	const rows = await executor
		.select({ meetingId: vote.meetingId, count: count(ballot.id) })
		.from(vote)
		.leftJoin(ballot, eq(ballot.voteId, vote.id))
		.where(and(inArray(vote.meetingId, meetingIds), eq(vote.lifecycle, 'open')))
		.groupBy(vote.meetingId);

	return new Map(rows.map((row) => [row.meetingId, row.count]));
}

export async function readActiveBallotCount(executor: AgendaExecutor, meetingId: string) {
	return (await readActiveBallotCounts(executor, [meetingId])).get(meetingId) ?? null;
}

function removePrivateBallot(projection: ParticipantPageProjection): ParticipantProjection {
	if (projection.state !== 'active') {
		return projection;
	}

	return {
		state: projection.state,
		meeting: projection.meeting,
		activeVoteKey: projection.activeVoteKey,
		vote: projection.vote,
		participation: projection.participation,
		revision: projection.revision
	};
}

function getPublicWinner(winner: SelectionWinner | null) {
	switch (winner?.type) {
		case 'option':
			return { type: 'option' as const, label: winner.label };
		case 'vacancy':
			return { type: 'vacancy' as const };
		case 'options':
			return { type: 'options' as const, options: winner.options.map(({ label }) => ({ label })) };
		case 'positions':
			return {
				type: 'positions' as const,
				positions: winner.positions.map((position) => {
					if (position.type === 'option') {
						return { type: 'option' as const, label: position.label };
					}
					if (position.type === 'vacancy') {
						return { type: 'vacancy' as const };
					}

					return { type: 'unresolved' as const };
				})
			};
		default:
			return null;
	}
}

function toPublicResult(
	organizerVote: NonNullable<Awaited<ReturnType<typeof readAgenda>>[number]>,
	includeBreakdown: boolean
): PublicVoteResult {
	if (!organizerVote.outcome || !organizerVote.revealed) {
		return { revealed: false };
	}
	const document = organizerVote.outcome.document;

	if (document.outcome.kind === 'decision') {
		if (!('support' in document.counts)) {
			throw new Error('Decision snapshot has Selection counts.');
		}
		if (document.vote.kind !== 'decision') {
			throw new Error('Decision snapshot has Selection Vote.');
		}
		const final: Extract<PublicOutcome, { kind: 'decision' }> = {
			kind: 'decision',
			state: document.outcome.state,
			winner: document.outcome.winner,
			majorityLabel: majorityRuleLabel(document.vote.decision),
			abstentionsCounted: document.vote.decision.abstentionsCounted
		};

		return {
			revealed: true,
			final,
			...(includeBreakdown ? { breakdown: document.counts } : {})
		};
	}

	if (!('options' in document.counts)) {
		throw new Error('Selection snapshot has Decision counts.');
	}
	const outcome = applyIncompleteResolution(document.outcome, organizerVote.resolution);
	const winner = outcome.winner;
	const publicWinner = getPublicWinner(winner);
	const final: Extract<PublicOutcome, { kind: 'selection' }> = {
		kind: 'selection',
		state: outcome.state,
		winner: publicWinner
	};

	return {
		revealed: true,
		final,
		...(includeBreakdown
			? {
					breakdown: {
						options: document.counts.options.map(({ label, count: optionCount }) => ({
							label,
							count: optionCount
						})),
						vacancy: document.counts.vacancy,
						abstention: document.counts.abstention
					}
				}
			: {})
	};
}

export async function readOrganizerMeetings(executor: AgendaExecutor, organizerUserId: string) {
	const rows = await executor
		.select(organizerMeetingColumns)
		.from(meeting)
		.where(eq(meeting.organizerUserId, organizerUserId))
		.orderBy(desc(meeting.createdAt), asc(meeting.id));

	const meetingIds = rows.map((row) => row.id);
	const [agendas, activeBallotCounts] = await Promise.all([
		readAgendaForMeetings(executor, meetingIds),
		readActiveBallotCounts(executor, meetingIds)
	]);

	return rows.map((row) =>
		mapOrganizerMeeting(row, agendas.get(row.id) ?? [], activeBallotCounts.get(row.id) ?? null)
	);
}

export async function listOrganizerMeetings(organizerUserId: string) {
	// Keep Meeting rows, agenda configuration, outcome data, resolutions, and Ballot counts on one
	// snapshot without taking row locks while another command commits.
	return db.transaction(async (tx) => readOrganizerMeetings(tx, organizerUserId), {
		isolationLevel: 'repeatable read',
		accessMode: 'read only'
	});
}

export async function readOrganizerMeetingByLocator(
	executor: AgendaExecutor,
	{
		organizerUserId,
		publicLocator
	}: {
		organizerUserId: string;
		publicLocator: string;
	}
) {
	const [row] = await executor
		.select(organizerMeetingColumns)
		.from(meeting)
		.where(
			and(eq(meeting.publicLocator, publicLocator), eq(meeting.organizerUserId, organizerUserId))
		)
		.limit(1);

	if (!row) {
		return null;
	}

	const [agenda, activeBallotCount] = await Promise.all([
		readAgendaForMeeting(executor, row.id),
		readActiveBallotCount(executor, row.id)
	]);

	return mapOrganizerMeeting(row, agenda, activeBallotCount);
}

export async function getOrganizerMeetingByLocator({
	organizerUserId,
	publicLocator
}: {
	organizerUserId: string;
	publicLocator: string;
}) {
	// Keep Meeting rows, agenda configuration, outcome data, resolutions, and Ballot counts on one
	// snapshot without taking row locks while another command commits.
	return db.transaction(
		async (tx) => readOrganizerMeetingByLocator(tx, { organizerUserId, publicLocator }),
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
}

async function readParticipantPageProjection(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	publicLocator: string,
	rawParticipantToken: string | undefined,
	onTokenAnomaly?: (input: ParticipantTokenAnomalyInput) => void
): Promise<ParticipantPageProjection> {
	// A repeatable-read snapshot keeps meeting revision, lifecycle, and active vote aligned while an
	// organizer may be activating or closing a vote in another transaction.
	const [row] = await tx
		.select({
			meetingId: meeting.id,
			title: meeting.title,
			lifecycle: meeting.lifecycle,
			revision: meeting.revision,
			expectedParticipantCount: meeting.expectedParticipantCount
		})
		.from(meeting)
		.where(eq(meeting.publicLocator, publicLocator))
		.limit(1);

	if (!row) {
		return { state: 'invalid', message: INVALID_MEETING_MESSAGE };
	}

	const nonActiveParticipation = {
		current: 0,
		expected: row.expectedParticipantCount
	};

	if (row.lifecycle === 'draft') {
		return { state: 'invalid', message: INVALID_MEETING_MESSAGE };
	}

	if (row.lifecycle === 'closed') {
		return {
			state: 'ended',
			meeting: { title: row.title },
			participation: nonActiveParticipation,
			revision: row.revision
		};
	}

	const [activeVote] = await tx
		.select()
		.from(vote)
		.where(and(eq(vote.meetingId, row.meetingId), eq(vote.lifecycle, 'open')))
		.limit(1);

	if (!activeVote) {
		const [closedVote] = await tx
			.select()
			.from(vote)
			.where(and(eq(vote.meetingId, row.meetingId), eq(vote.lifecycle, 'closed')))
			.orderBy(desc(vote.closedAt), desc(vote.position))
			.limit(1);

		if (closedVote) {
			const [outcomes, resolutions] = await Promise.all([
				readOutcomeSnapshots(tx, [closedVote.id]),
				readOutcomeResolutions(tx, [closedVote.id])
			]);
			const [organizerVote] = await readAgenda(tx, [closedVote], outcomes, resolutions);

			if (!organizerVote) {
				throw new Error('Closed Vote is missing its configuration.');
			}
			const [closedParticipation] = await tx
				.select({ count: count() })
				.from(ballot)
				.where(eq(ballot.voteId, closedVote.id));

			return {
				state: 'closed',
				meeting: { title: row.title },
				vote:
					organizerVote.kind === 'decision'
						? {
								title: organizerVote.title,
								kind: organizerVote.kind,
								decision: participantDecisionLabels(organizerVote.decision)
							}
						: { title: organizerVote.title, kind: organizerVote.kind },
				participation: {
					current: closedParticipation.count,
					expected: row.expectedParticipantCount
				},
				result: toPublicResult(organizerVote, organizerVote.publicResultBreakdownEnabled ?? false),
				revision: row.revision
			};
		}

		return {
			state: 'waiting',
			meeting: { title: row.title },
			participation: nonActiveParticipation,
			revision: row.revision
		};
	}

	const [currentParticipation] = await tx
		.select({ count: count() })
		.from(ballot)
		.where(eq(ballot.voteId, activeVote.id));

	const participation = {
		current: currentParticipation.count,
		expected: row.expectedParticipantCount
	};

	const [organizerVote] = await readAgenda(tx, [activeVote]);

	if (!activeVote.openedAt) {
		throw new Error('Active Vote is missing its open timestamp.');
	}
	const currentBallot = await readCurrentParticipantBallot(tx, {
		meetingId: row.meetingId,
		voteId: activeVote.id,
		rawParticipantToken,
		onTokenAnomaly
	});
	const activeProjection = {
		state: 'active' as const,
		meeting: { title: row.title },
		activeVoteKey: createActiveVoteKey(activeVote.id),
		participation,
		revision: row.revision,
		currentBallot
	};

	if (organizerVote.kind === 'decision') {
		return {
			...activeProjection,
			vote: {
				title: organizerVote.title,
				kind: organizerVote.kind,
				decision: {
					...participantDecisionLabels(organizerVote.decision),
					majorityLabel: majorityRequirement(organizerVote.decision)
				}
			}
		};
	}

	return {
		...activeProjection,
		vote: {
			title: organizerVote.title,
			kind: organizerVote.kind,
			selection: {
				mode: organizerVote.selection.mode,
				positionCount: organizerVote.selection.positionCount,
				vacancyEnabled: organizerVote.selection.vacancyEnabled,
				options: organizerVote.selection.options.map(({ id, label }) => ({ id, label }))
			}
		}
	};
}

export async function getParticipantPageProjection(
	publicLocator: string,
	rawParticipantToken?: string
): Promise<ParticipantPageProjection> {
	let anomaly: ParticipantTokenAnomalyInput | undefined;
	const projection = await db.transaction(
		async (tx) =>
			readParticipantPageProjection(tx, publicLocator, rawParticipantToken, (input) => {
				anomaly = input;
			}),
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);

	// The projection transaction has committed before this separate best-effort write starts. This
	// avoids both savepoint poisoning and pool deadlock when many pages report the same anomaly.
	if (anomaly) {
		await recordParticipantTokenAnomalyBestEffort(anomaly);
	}

	return projection;
}

export async function getParticipantProjection(
	publicLocator: string
): Promise<ParticipantProjection> {
	return db.transaction(
		async (tx) => {
			const pageProjection = await readParticipantPageProjection(tx, publicLocator, undefined);

			return removePrivateBallot(pageProjection);
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
}

function toPresentationProjection(
	projection: ParticipantProjection,
	presentationQrEnabled: boolean
) {
	if (projection.state === 'invalid') {
		return projection;
	}
	if (projection.state !== 'active') {
		return {
			...projection,
			presentationQrEnabled: projection.state === 'ended' ? false : presentationQrEnabled
		} satisfies PresentationProjection;
	}

	const presentation = {
		state: 'active',
		meeting: projection.meeting,
		vote:
			projection.vote.kind === 'decision'
				? projection.vote
				: {
						kind: 'selection',
						title: projection.vote.title,
						selection: {
							...projection.vote.selection,
							options: projection.vote.selection.options.map(({ label }) => ({ label }))
						}
					},
		participation: projection.participation,
		presentationQrEnabled,
		revision: projection.revision
	} satisfies PresentationProjection;

	return presentation;
}

export async function getPresentationProjection(
	publicLocator: string
): Promise<PresentationProjection> {
	return db.transaction(
		async (tx) => {
			const [settings] = await tx
				.select({ presentationQrEnabled: meeting.presentationQrEnabled })
				.from(meeting)
				.where(eq(meeting.publicLocator, publicLocator))
				.limit(1);

			if (!settings) {
				return { state: 'invalid', message: INVALID_MEETING_MESSAGE };
			}

			const projection = removePrivateBallot(
				await readParticipantPageProjection(tx, publicLocator, undefined)
			);

			return toPresentationProjection(projection, settings.presentationQrEnabled);
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
}

export async function getParticipantMeetingId(publicLocator: string) {
	const [row] = await db
		.select({ id: meeting.id })
		.from(meeting)
		.where(eq(meeting.publicLocator, publicLocator))
		.limit(1);

	return row?.id ?? null;
}
