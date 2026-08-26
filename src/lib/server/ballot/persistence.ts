import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ballot } from '#lib/server/db/schema/participation.js';
import type { StoredBallotPayload } from './payload.js';
import type { BallotTransaction } from './types.js';

export type BallotPersistenceResult =
	{ kind: 'unchanged' } | { kind: 'inserted' } | { kind: 'replaced' };

function equalStoredBallotPayload(left: StoredBallotPayload, right: StoredBallotPayload) {
	if (left.type === 'decision' || right.type === 'decision') {
		return left.type === 'decision' && right.type === 'decision' && left.choice === right.choice;
	}

	const leftOptionIds = new Set(left.selectedOptionIds);
	const rightOptionIds = new Set(right.selectedOptionIds);

	return (
		left.vacancyCount === right.vacancyCount &&
		left.abstain === right.abstain &&
		leftOptionIds.size === rightOptionIds.size &&
		[...leftOptionIds].every((id) => rightOptionIds.has(id))
	);
}

export async function upsertCurrentBallot(
	tx: BallotTransaction,
	{
		meetingId,
		voteId,
		participantTokenId,
		payload
	}: {
		meetingId: string;
		voteId: string;
		participantTokenId: string;
		payload: StoredBallotPayload;
	}
) {
	// The caller has already taken the shared Meeting and Vote locks. Lock an existing Ballot for a
	// replacement. If two writes both observe no row, the unique index arbitrates the insert and the
	// loser rereads the committed row before applying its replacement.
	const [currentBallot] = await tx
		.select({ id: ballot.id, payload: ballot.payload })
		.from(ballot)
		.where(and(eq(ballot.voteId, voteId), eq(ballot.participantTokenId, participantTokenId)))
		.for('update')
		.limit(1);

	if (currentBallot) {
		if (equalStoredBallotPayload(currentBallot.payload, payload)) return { kind: 'unchanged' };

		await tx
			.update(ballot)
			.set({ payload, updatedAt: new Date() })
			.where(eq(ballot.id, currentBallot.id));
		return { kind: 'replaced' };
	}

	const [inserted] = await tx
		.insert(ballot)
		.values({
			id: uuidv7(),
			meetingId,
			voteId,
			participantTokenId,
			payload
		})
		.onConflictDoNothing()
		.returning({ id: ballot.id });
	if (inserted) return { kind: 'inserted' };

	const [racedBallot] = await tx
		.select({ id: ballot.id, payload: ballot.payload })
		.from(ballot)
		.where(and(eq(ballot.voteId, voteId), eq(ballot.participantTokenId, participantTokenId)))
		.for('update')
		.limit(1);
	if (!racedBallot) throw new Error('Ballot disappeared after a unique-key race.');
	if (equalStoredBallotPayload(racedBallot.payload, payload)) return { kind: 'unchanged' };

	await tx
		.update(ballot)
		.set({ payload, updatedAt: new Date() })
		.where(eq(ballot.id, racedBallot.id));
	return { kind: 'replaced' };
}
