import { and, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { ballot } from '#lib/server/db/schema/participation.js';
import type { StoredBallotPayload } from './payload.js';
import type { BallotTransaction } from './types.js';

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
	// The caller locks the meeting and active vote first. Lock the ballot next so replacements use
	// the same order and stay inside one transaction.
	const [currentBallot] = await tx
		.select({ id: ballot.id })
		.from(ballot)
		.where(and(eq(ballot.voteId, voteId), eq(ballot.participantTokenId, participantTokenId)))
		.for('update')
		.limit(1);

	if (currentBallot) {
		await tx
			.update(ballot)
			.set({ payload, updatedAt: new Date() })
			.where(eq(ballot.id, currentBallot.id));
		return true;
	}

	await tx.insert(ballot).values({
		id: uuidv7(),
		meetingId,
		voteId,
		participantTokenId,
		payload
	});
	return true;
}

export async function advanceMeetingRevision(tx: BallotTransaction, meetingId: string) {
	const [updated] = await tx
		.update(meeting)
		.set({ revision: sql`${meeting.revision} + 1` })
		.where(eq(meeting.id, meetingId))
		.returning({ revision: meeting.revision });

	if (!updated) throw new Error('Meeting disappeared while advancing its revision.');
	return updated.revision;
}
