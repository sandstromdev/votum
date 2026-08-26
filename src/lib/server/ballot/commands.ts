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
import {
	createParticipantToken,
	decryptParticipantToken,
	encryptParticipantToken,
	hashInitialSubmissionKey,
	hashInitialSubmissionPayload,
	hashParticipantToken
} from './identity.js';
import { upsertCurrentBallot } from './persistence.js';
import { resolveParticipantToken } from './token-resolution.js';
import type { BallotTransaction } from './types.js';
import { BallotError } from '#lib/server/ballot/error.js';
import { createTimingContext, withTiming, type TimingContext } from '#lib/server/timing.js';

type DecisionBallotCommand = {
	publicLocator: string;
	activeVoteKey: string;
	choice: DecisionBallotChoice;
	rawParticipantToken?: string;
	initialSubmissionKey?: string;
	timing?: TimingContext;
};

type WithdrawDecisionBallotCommand = {
	publicLocator: string;
	rawParticipantToken?: string;
	timing?: TimingContext;
};

type SelectionBallotCommand = {
	publicLocator: string;
	activeVoteKey: string;
	selectedOptionIds: string[];
	vacancyCount: number;
	abstain: boolean;
	rawParticipantToken?: string;
	initialSubmissionKey?: string;
	timing?: TimingContext;
};

type WithdrawBallotCommand = {
	publicLocator: string;
	rawParticipantToken: string | undefined;
	kind: VoteKind;
	timing?: TimingContext;
};

type InitialSubmissionRecord = {
	id: string;
	tokenHash: string;
	initialSubmissionVoteId: string | null;
	initialSubmissionPayloadHash: string | null;
	initialSubmissionTokenCiphertext: string | null;
};

async function lockMeeting(tx: BallotTransaction, publicLocator: string) {
	const [lockedMeeting] = await tx
		.select({ id: meeting.id, lifecycle: meeting.lifecycle })
		.from(meeting)
		.where(eq(meeting.publicLocator, publicLocator))
		// Shared key locks allow independent Ballot writes to proceed together. Close and End take
		// the same row in update mode, so they wait for writes that crossed this boundary.
		.for('key share')
		.limit(1);
	return lockedMeeting ?? null;
}

async function lockActiveVote(tx: BallotTransaction, meetingId: string) {
	const [activeVote] = await tx
		.select({ id: vote.id, kind: vote.kind })
		.from(vote)
		.where(and(eq(vote.meetingId, meetingId), eq(vote.lifecycle, 'open')))
		// Keep the Meeting -> Vote order used by lifecycle commands. Key-share locks are compatible
		// with other Ballot writes and conflict with Close's update lock.
		.for('key share')
		.limit(1);
	if (!activeVote) return null;

	return { meetingId, voteId: activeVote.id, kind: activeVote.kind };
}

function rejectStaleActiveVote(voteId: string, submittedActiveVoteKey: string) {
	if (createActiveVoteKey(voteId) !== submittedActiveVoteKey) {
		throw new BallotError('stale_active_vote');
	}
}

async function ensureParticipantToken(
	tx: BallotTransaction,
	meetingId: string,
	voteId: string,
	rawParticipantToken: string | undefined,
	initialSubmissionKey: string | undefined,
	initialSubmissionPayload: unknown,
	activeVoteKey: string
) {
	// A missing, stale, or cross-meeting cookie gets a new token. Keep the old token and ballot because
	// a lost participant token cannot be recovered.
	const existing = await resolveParticipantToken(tx, {
		meetingId,
		voteId,
		rawParticipantToken,
		operation: 'submit'
	});
	if (existing) return { id: existing.id, createdToken: null, replayed: false };
	if (!initialSubmissionKey) {
		if (rawParticipantToken) {
			const createdToken = createParticipantToken();
			const [created] = await tx
				.insert(participantToken)
				.values({
					id: uuidv7(),
					meetingId,
					tokenHash: hashParticipantToken(createdToken)
				})
				.returning({ id: participantToken.id });
			return { id: created.id, createdToken, replayed: false };
		}

		throw new BallotError('initial_submission_key_required');
	}

	const initialSubmissionKeyHash = hashInitialSubmissionKey(initialSubmissionKey);
	const initialSubmissionPayloadHash = hashInitialSubmissionPayload(initialSubmissionPayload);
	const [replayed] = await tx
		.select({
			id: participantToken.id,
			tokenHash: participantToken.tokenHash,
			initialSubmissionVoteId: participantToken.initialSubmissionVoteId,
			initialSubmissionPayloadHash: participantToken.initialSubmissionPayloadHash,
			initialSubmissionTokenCiphertext: participantToken.initialSubmissionTokenCiphertext
		})
		.from(participantToken)
		.where(
			and(
				eq(participantToken.meetingId, meetingId),
				eq(participantToken.initialSubmissionKeyHash, initialSubmissionKeyHash)
			)
		)
		.for('update')
		.limit(1);

	if (replayed) {
		if (
			replayed.initialSubmissionVoteId !== voteId ||
			replayed.initialSubmissionPayloadHash !== initialSubmissionPayloadHash
		) {
			throw new BallotError('initial_submission_conflict');
		}
		if (!replayed.initialSubmissionTokenCiphertext) {
			throw new Error('Initial submission token recovery data is missing.');
		}

		const replayedToken = decryptParticipantToken(replayed.initialSubmissionTokenCiphertext);
		if (hashParticipantToken(replayedToken) !== replayed.tokenHash) {
			throw new Error('Initial submission token recovery failed verification.');
		}
		return { id: replayed.id, createdToken: replayedToken, replayed: true };
	}

	const createdToken = createParticipantToken();

	const [created] = await tx
		.insert(participantToken)
		.values({
			id: uuidv7(),
			meetingId,
			tokenHash: hashParticipantToken(createdToken),
			initialSubmissionKeyHash,
			initialSubmissionVoteId: voteId,
			initialSubmissionPayloadHash,
			initialSubmissionTokenCiphertext: encryptParticipantToken(createdToken)
		})
		.onConflictDoNothing()
		.returning({ id: participantToken.id });

	if (!created) {
		const [raced] = await tx
			.select({
				id: participantToken.id,
				tokenHash: participantToken.tokenHash,
				initialSubmissionVoteId: participantToken.initialSubmissionVoteId,
				initialSubmissionPayloadHash: participantToken.initialSubmissionPayloadHash,
				initialSubmissionTokenCiphertext: participantToken.initialSubmissionTokenCiphertext
			})
			.from(participantToken)
			.where(
				and(
					eq(participantToken.meetingId, meetingId),
					eq(participantToken.initialSubmissionKeyHash, initialSubmissionKeyHash)
				)
			)
			.for('update')
			.limit(1);

		if (!raced) throw new Error('Initial submission disappeared after a unique-key race.');
		return replayInitialSubmission(tx, raced, activeVoteKey, initialSubmissionPayload);
	}

	return { id: created.id, createdToken, replayed: false };
}

async function readInitialSubmission(
	tx: BallotTransaction,
	meetingId: string,
	initialSubmissionKey: string | undefined
) {
	if (!initialSubmissionKey) return null;

	const [record] = await tx
		.select({
			id: participantToken.id,
			tokenHash: participantToken.tokenHash,
			initialSubmissionVoteId: participantToken.initialSubmissionVoteId,
			initialSubmissionPayloadHash: participantToken.initialSubmissionPayloadHash,
			initialSubmissionTokenCiphertext: participantToken.initialSubmissionTokenCiphertext
		})
		.from(participantToken)
		.where(
			and(
				eq(participantToken.meetingId, meetingId),
				eq(
					participantToken.initialSubmissionKeyHash,
					hashInitialSubmissionKey(initialSubmissionKey)
				)
			)
		)
		.limit(1);

	return record ?? null;
}

async function replayInitialSubmission(
	tx: BallotTransaction,
	record: InitialSubmissionRecord,
	activeVoteKey: string,
	initialSubmissionPayload: unknown
) {
	const voteId = record.initialSubmissionVoteId;
	if (!voteId) {
		throw new Error('Initial submission Vote ID is missing.');
	}
	if (
		record.initialSubmissionPayloadHash !==
			hashInitialSubmissionPayload(initialSubmissionPayload) ||
		createActiveVoteKey(voteId) !== activeVoteKey
	) {
		throw new BallotError('initial_submission_conflict');
	}
	if (!record.initialSubmissionTokenCiphertext) {
		throw new Error('Initial submission token recovery data is missing.');
	}

	const [lockedRecord] = await tx
		.select({
			id: participantToken.id,
			tokenHash: participantToken.tokenHash,
			initialSubmissionTokenCiphertext: participantToken.initialSubmissionTokenCiphertext
		})
		.from(participantToken)
		.where(eq(participantToken.id, record.id))
		.for('update')
		.limit(1);
	if (!lockedRecord?.initialSubmissionTokenCiphertext) {
		throw new Error('Initial submission token recovery data is missing.');
	}

	const replayedToken = decryptParticipantToken(lockedRecord.initialSubmissionTokenCiphertext);
	if (hashParticipantToken(replayedToken) !== lockedRecord.tokenHash) {
		throw new Error('Initial submission token recovery failed verification.');
	}
	return { id: lockedRecord.id, createdToken: replayedToken, replayed: true };
}

export async function submitDecisionBallot(input: DecisionBallotCommand) {
	const timing = input.timing ?? createTimingContext();
	// Shared locks keep independent Ballot writes concurrent. Close and End take the same rows in
	// update mode, so they wait for writes that crossed this boundary before changing lifecycle.
	const committed = await withTiming(timing, 'ballot.transaction', () =>
		db.transaction(async (tx) => {
			const lockedMeeting = await lockMeeting(tx, input.publicLocator);
			if (!lockedMeeting) return null;

			const initialSubmissionPayload = { type: 'decision' as const, choice: input.choice };
			const initialSubmission = input.rawParticipantToken
				? null
				: await readInitialSubmission(tx, lockedMeeting.id, input.initialSubmissionKey);
			const activeVote =
				lockedMeeting.lifecycle === 'open' ? await lockActiveVote(tx, lockedMeeting.id) : null;

			if (initialSubmission) {
				return {
					value: {
						changed: true,
						createdToken: (
							await replayInitialSubmission(
								tx,
								initialSubmission,
								input.activeVoteKey,
								initialSubmissionPayload
							)
						).createdToken
					},
					meetingId: lockedMeeting.id,
					ballotActivity: false
				};
			}

			if (!activeVote) return null;
			// Reject a stale form before creating a token or writing a ballot.
			rejectStaleActiveVote(activeVote.voteId, input.activeVoteKey);
			if (activeVote.kind !== 'decision') return null;

			const token = await ensureParticipantToken(
				tx,
				activeVote.meetingId,
				activeVote.voteId,
				input.rawParticipantToken,
				input.initialSubmissionKey,
				initialSubmissionPayload,
				input.activeVoteKey
			);

			const persistence = token.replayed
				? null
				: await upsertCurrentBallot(tx, {
						meetingId: activeVote.meetingId,
						voteId: activeVote.voteId,
						participantTokenId: token.id,
						payload: { type: 'decision', choice: input.choice }
					});
			const stateChanged = !token.replayed && persistence?.kind !== 'unchanged';

			return {
				value: { changed: token.replayed || stateChanged, createdToken: token.createdToken },
				meetingId: activeVote.meetingId,
				ballotActivity: stateChanged
			};
		})
	);

	if (committed?.ballotActivity) {
		const participantToken = committed.value.createdToken ?? input.rawParticipantToken;
		meetingPubSub.publishBallotActivity(committed.meetingId, {
			participantTokenHash: participantToken ? hashParticipantToken(participantToken) : undefined,
			timing
		});
	}

	return committed?.value ?? null;
}

export async function submitSelectionBallot(input: SelectionBallotCommand) {
	const timing = input.timing ?? createTimingContext();
	// Read the configuration after locking the active vote so validation and the write share the Close boundary.
	const committed = await withTiming(timing, 'ballot.transaction', () =>
		db.transaction(async (tx) => {
			const lockedMeeting = await lockMeeting(tx, input.publicLocator);
			if (!lockedMeeting) return null;

			const initialSubmissionPayload = {
				type: 'selection' as const,
				selectedOptionIds: input.selectedOptionIds,
				vacancyCount: input.vacancyCount,
				abstain: input.abstain
			};
			const initialSubmission = input.rawParticipantToken
				? null
				: await readInitialSubmission(tx, lockedMeeting.id, input.initialSubmissionKey);
			const activeVote =
				lockedMeeting.lifecycle === 'open' ? await lockActiveVote(tx, lockedMeeting.id) : null;

			if (initialSubmission) {
				return {
					value: {
						changed: true,
						createdToken: (
							await replayInitialSubmission(
								tx,
								initialSubmission,
								input.activeVoteKey,
								initialSubmissionPayload
							)
						).createdToken
					},
					meetingId: lockedMeeting.id,
					ballotActivity: false
				};
			}

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

			if (input.selectedOptionIds.length > 0) {
				const ownedOptions = await tx
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

			const payload = initialSubmissionPayload;
			const token = await ensureParticipantToken(
				tx,
				activeVote.meetingId,
				activeVote.voteId,
				input.rawParticipantToken,
				input.initialSubmissionKey,
				payload,
				input.activeVoteKey
			);
			const persistence = token.replayed
				? null
				: await upsertCurrentBallot(tx, {
						meetingId: activeVote.meetingId,
						voteId: activeVote.voteId,
						participantTokenId: token.id,
						payload
					});
			const stateChanged = !token.replayed && persistence?.kind !== 'unchanged';

			return {
				value: { changed: token.replayed || stateChanged, createdToken: token.createdToken },
				meetingId: activeVote.meetingId,
				ballotActivity: stateChanged
			};
		})
	);

	if (committed?.ballotActivity) {
		const participantToken = committed.value.createdToken ?? input.rawParticipantToken;
		meetingPubSub.publishBallotActivity(committed.meetingId, {
			participantTokenHash: participantToken ? hashParticipantToken(participantToken) : undefined,
			timing
		});
	}

	return committed?.value ?? null;
}

async function withdrawBallot({
	publicLocator,
	rawParticipantToken,
	kind,
	timing: inputTiming
}: WithdrawBallotCommand) {
	const timing = inputTiming ?? createTimingContext();
	// Use the same shared-lock order as submission. Lifecycle commands use update locks at this seam.
	const committed = await withTiming(timing, 'ballot.transaction', () =>
		db.transaction(async (tx) => {
			const lockedMeeting = await lockMeeting(tx, publicLocator);
			const activeVote =
				lockedMeeting?.lifecycle === 'open' ? await lockActiveVote(tx, lockedMeeting.id) : null;
			if (!activeVote || activeVote.kind !== kind) return null;
			if (!rawParticipantToken) {
				return {
					value: { changed: false },
					meetingId: activeVote.meetingId,
					ballotActivity: false
				};
			}

			const token = await resolveParticipantToken(tx, {
				meetingId: activeVote.meetingId,
				voteId: activeVote.voteId,
				rawParticipantToken,
				operation: 'withdraw'
			});
			if (!token) {
				return {
					value: { changed: false },
					meetingId: activeVote.meetingId,
					ballotActivity: false
				};
			}

			const deleted = await tx
				.delete(ballot)
				.where(and(eq(ballot.voteId, activeVote.voteId), eq(ballot.participantTokenId, token.id)))
				.returning({ id: ballot.id });
			if (deleted.length === 0) {
				return {
					value: { changed: false },
					meetingId: activeVote.meetingId,
					ballotActivity: false
				};
			}

			return { value: { changed: true }, meetingId: activeVote.meetingId, ballotActivity: true };
		})
	);

	if (committed?.ballotActivity) {
		meetingPubSub.publishBallotActivity(committed.meetingId, {
			participantTokenHash: rawParticipantToken
				? hashParticipantToken(rawParticipantToken)
				: undefined,
			timing
		});
	}

	return committed?.value ?? null;
}

export async function withdrawDecisionBallot(input: WithdrawDecisionBallotCommand) {
	return withdrawBallot({
		publicLocator: input.publicLocator,
		rawParticipantToken: input.rawParticipantToken,
		kind: 'decision',
		timing: input.timing
	});
}

export async function withdrawSelectionBallot(input: {
	publicLocator: string;
	rawParticipantToken?: string;
	timing?: TimingContext;
}) {
	return withdrawBallot({
		publicLocator: input.publicLocator,
		rawParticipantToken: input.rawParticipantToken,
		kind: 'selection',
		timing: input.timing
	});
}
