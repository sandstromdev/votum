import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { ballot, participantToken } from '#lib/server/db/schema/participation.js';
import { selectionOption, selectionVoteConfig, vote } from '#lib/server/db/schema/vote.js';
import { createActiveVoteKey } from '#lib/server/meeting/active-vote-key.js';
import { meetingPubSub } from '#lib/server/pubsub.js';
import type { VoteKind } from '#lib/vote/agenda.js';
import type { DecisionBallotChoice } from '#lib/vote/ballot.js';
import { and, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { createParticipantToken, hashParticipantToken } from './identity.js';
import { advanceMeetingRevision, upsertCurrentBallot } from './persistence.js';
import { resolveParticipantToken } from './token-resolution.js';
import type { BallotTransaction } from './types.js';

export class StaleActiveVoteError extends Error {
	constructor() {
		super('The submitted Vote is not the current Active Vote.');
		this.name = 'StaleActiveVoteError';
	}
}

type DecisionBallotCommand = {
	publicLocator: string;
	activeVoteKey: string;
	choice: DecisionBallotChoice;
	rawParticipantToken?: string;
};

type WithdrawDecisionBallotCommand = {
	publicLocator: string;
	rawParticipantToken?: string;
};

type SelectionBallotCommand = {
	publicLocator: string;
	activeVoteKey: string;
	selectedOptionIds: string[];
	vacancyCount: number;
	abstain: boolean;
	rawParticipantToken?: string;
};

type WithdrawBallotCommand = {
	publicLocator: string;
	rawParticipantToken: string | undefined;
	kind: VoteKind;
};

async function lockActiveVote(tx: BallotTransaction, publicLocator: string) {
	const [openMeeting] = await tx
		.select({ id: meeting.id })
		.from(meeting)
		.where(and(eq(meeting.publicLocator, publicLocator), eq(meeting.lifecycle, 'open')))
		.for('update')
		.limit(1);
	if (!openMeeting) return null;

	const [activeVote] = await tx
		.select({ id: vote.id, kind: vote.kind })
		.from(vote)
		.where(and(eq(vote.meetingId, openMeeting.id), eq(vote.lifecycle, 'open')))
		.for('update')
		.limit(1);
	if (!activeVote) return null;

	return { meetingId: openMeeting.id, voteId: activeVote.id, kind: activeVote.kind };
}

function rejectStaleActiveVote(voteId: string, submittedActiveVoteKey: string) {
	if (createActiveVoteKey(voteId) !== submittedActiveVoteKey) {
		throw new StaleActiveVoteError();
	}
}

async function ensureParticipantToken(
	tx: BallotTransaction,
	meetingId: string,
	voteId: string,
	rawParticipantToken: string | undefined
) {
	// A missing, stale, or cross-meeting cookie gets a new token. Keep the old token and ballot because
	// a lost participant token cannot be recovered.
	const existing = await resolveParticipantToken(tx, {
		meetingId,
		voteId,
		rawParticipantToken,
		operation: 'submit'
	});
	if (existing) return { id: existing.id, createdToken: null };

	const createdToken = createParticipantToken();

	const [created] = await tx
		.insert(participantToken)
		.values({
			id: uuidv7(),
			meetingId,
			tokenHash: hashParticipantToken(createdToken)
		})
		.returning({ id: participantToken.id });

	return { id: created.id, createdToken };
}

export async function submitDecisionBallot(input: DecisionBallotCommand) {
	// Lock the meeting before the vote so ballot writes cannot overlap Close or End.
	const committed = await db.transaction(async (tx) => {
		const activeVote = await lockActiveVote(tx, input.publicLocator);
		if (!activeVote) return null;
		// Reject a stale form before creating a token or writing a ballot.
		rejectStaleActiveVote(activeVote.voteId, input.activeVoteKey);
		if (activeVote.kind !== 'decision') return null;

		const token = await ensureParticipantToken(
			tx,
			activeVote.meetingId,
			activeVote.voteId,
			input.rawParticipantToken
		);

		const changed = await upsertCurrentBallot(tx, {
			meetingId: activeVote.meetingId,
			voteId: activeVote.voteId,
			participantTokenId: token.id,
			payload: { type: 'decision', choice: input.choice }
		});

		const revision = changed ? await advanceMeetingRevision(tx, activeVote.meetingId) : null;

		return {
			value: { changed: true, createdToken: token.createdToken },
			meetingId: activeVote.meetingId,
			revision
		};
	});

	if (committed && committed.revision !== null) {
		meetingPubSub.publish(committed.meetingId, committed.revision);
	}

	return committed?.value ?? null;
}

export async function submitSelectionBallot(input: SelectionBallotCommand) {
	// Read the configuration after locking the active vote so validation and the write share the Close boundary.
	const committed = await db.transaction(async (tx) => {
		const activeVote = await lockActiveVote(tx, input.publicLocator);
		if (!activeVote) return null;
		rejectStaleActiveVote(activeVote.voteId, input.activeVoteKey);
		if (activeVote.kind !== 'selection') return null;

		const [configuration] = await tx
			.select({
				positionCount: selectionVoteConfig.positionCount,
				vacancyEnabled: selectionVoteConfig.vacancyEnabled
			})
			.from(selectionVoteConfig)
			.where(eq(selectionVoteConfig.voteId, activeVote.voteId))
			.limit(1);

		if (!configuration) return null;

		let ownedOptions: Array<{ id: string }> = [];

		if (input.selectedOptionIds.length > 0) {
			ownedOptions = await tx
				.select({ id: selectionOption.id })
				.from(selectionOption)
				.where(
					and(
						eq(selectionOption.voteId, activeVote.voteId),
						inArray(selectionOption.id, input.selectedOptionIds)
					)
				);
			if (ownedOptions.length !== input.selectedOptionIds.length) {
				throw new Error('Selection Ballot contains an option from another Vote.');
			}
		}

		if (input.selectedOptionIds.length + input.vacancyCount > configuration.positionCount) {
			throw new Error('Selection Ballot contains too many positions.');
		}
		if (!configuration.vacancyEnabled && input.vacancyCount > 0) {
			throw new Error('This Selection Vote does not allow Vacancy.');
		}

		const token = await ensureParticipantToken(
			tx,
			activeVote.meetingId,
			activeVote.voteId,
			input.rawParticipantToken
		);
		const payload = {
			type: 'selection' as const,
			selectedOptionIds: ownedOptions.map(({ id }) => id),
			vacancyCount: input.vacancyCount,
			abstain: input.abstain
		};
		const changed = await upsertCurrentBallot(tx, {
			meetingId: activeVote.meetingId,
			voteId: activeVote.voteId,
			participantTokenId: token.id,
			payload
		});
		const revision = changed ? await advanceMeetingRevision(tx, activeVote.meetingId) : null;

		return {
			value: { changed: true, createdToken: token.createdToken },
			meetingId: activeVote.meetingId,
			revision
		};
	});

	if (committed && committed.revision !== null) {
		meetingPubSub.publish(committed.meetingId, committed.revision);
	}

	return committed?.value ?? null;
}

async function withdrawBallot({ publicLocator, rawParticipantToken, kind }: WithdrawBallotCommand) {
	// Use the submission lock order so withdrawal cannot race a lifecycle transition.
	const committed = await db.transaction(async (tx) => {
		const activeVote = await lockActiveVote(tx, publicLocator);
		if (!activeVote || activeVote.kind !== kind) return null;
		if (!rawParticipantToken) {
			return { value: { changed: false }, meetingId: activeVote.meetingId, revision: null };
		}

		const token = await resolveParticipantToken(tx, {
			meetingId: activeVote.meetingId,
			voteId: activeVote.voteId,
			rawParticipantToken,
			operation: 'withdraw'
		});
		if (!token) {
			return { value: { changed: false }, meetingId: activeVote.meetingId, revision: null };
		}

		const deleted = await tx
			.delete(ballot)
			.where(and(eq(ballot.voteId, activeVote.voteId), eq(ballot.participantTokenId, token.id)))
			.returning({ id: ballot.id });
		if (deleted.length === 0) {
			return { value: { changed: false }, meetingId: activeVote.meetingId, revision: null };
		}
		const revision = await advanceMeetingRevision(tx, activeVote.meetingId);

		return { value: { changed: true }, meetingId: activeVote.meetingId, revision };
	});

	if (committed && committed.revision !== null) {
		meetingPubSub.publish(committed.meetingId, committed.revision);
	}

	return committed?.value ?? null;
}

export async function withdrawDecisionBallot(input: WithdrawDecisionBallotCommand) {
	return withdrawBallot({
		publicLocator: input.publicLocator,
		rawParticipantToken: input.rawParticipantToken,
		kind: 'decision'
	});
}

export async function withdrawSelectionBallot(input: {
	publicLocator: string;
	rawParticipantToken?: string;
}) {
	return withdrawBallot({
		publicLocator: input.publicLocator,
		rawParticipantToken: input.rawParticipantToken,
		kind: 'selection'
	});
}
