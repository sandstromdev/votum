import { eq } from 'drizzle-orm';
import { participantToken } from '#lib/server/db/schema/participation.js';
import { hashParticipantToken } from './identity.js';
import { recordParticipantTokenAnomaly } from './diagnostics.js';
import type { BallotTransaction } from './types.js';

export type BallotOperation = 'read' | 'submit' | 'withdraw';

export async function resolveParticipantToken(
	tx: BallotTransaction,
	{
		meetingId,
		voteId,
		rawParticipantToken,
		operation
	}: {
		meetingId: string;
		voteId: string;
		rawParticipantToken: string | undefined;
		operation: BallotOperation;
	}
) {
	// Record anomalies in the boundary transaction. Store only the hash and operation, never the token.
	if (!rawParticipantToken) return null;

	const tokenHash = hashParticipantToken(rawParticipantToken);
	const [existing] = await tx
		.select({ id: participantToken.id, meetingId: participantToken.meetingId })
		.from(participantToken)
		.where(eq(participantToken.tokenHash, tokenHash))
		.limit(1);

	if (existing?.meetingId === meetingId) return existing;

	await recordParticipantTokenAnomaly(tx, {
		name: existing ? 'participant_token_wrong_meeting' : 'participant_token_unrecognized',
		meetingId,
		voteId,
		operation,
		tokenState: existing ? 'wrong_meeting' : 'unrecognized'
	});
	return null;
}
