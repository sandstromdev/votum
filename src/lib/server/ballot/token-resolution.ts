import { eq } from 'drizzle-orm';
import { participantToken } from '#lib/server/db/schema/participation.js';
import { hashParticipantToken } from './identity.js';
import { recordParticipantTokenAnomaly, type ParticipantTokenAnomalyInput } from './diagnostics.js';
import type { BallotTransaction } from './types.js';

export type BallotOperation = 'read' | 'submit' | 'withdraw';

export async function resolveParticipantToken(
	tx: BallotTransaction,
	{
		meetingId,
		voteId,
		rawParticipantToken,
		operation,
		recordTokenAnomaly = true,
		onTokenAnomaly
	}: {
		meetingId: string;
		voteId: string;
		rawParticipantToken: string | undefined;
		operation: BallotOperation;
		recordTokenAnomaly?: boolean;
		onTokenAnomaly?: (input: ParticipantTokenAnomalyInput) => void;
	}
) {
	// Store only the hash and operation, never the token. Page reads provide a callback so the
	// diagnostic can be written after their repeatable-read transaction has committed.
	if (!rawParticipantToken) {
		return null;
	}

	const tokenHash = hashParticipantToken(rawParticipantToken);
	const [existing] = await tx
		.select({ id: participantToken.id, meetingId: participantToken.meetingId })
		.from(participantToken)
		.where(eq(participantToken.tokenHash, tokenHash))
		.limit(1);

	if (existing?.meetingId === meetingId) {
		return existing;
	}
	if (!recordTokenAnomaly) {
		return null;
	}

	const anomaly = {
		name: existing ? 'participant_token_wrong_meeting' : 'participant_token_unrecognized',
		meetingId,
		voteId,
		operation,
		tokenState: existing ? 'wrong_meeting' : 'unrecognized'
	} satisfies ParticipantTokenAnomalyInput;

	if (onTokenAnomaly) {
		onTokenAnomaly(anomaly);
	} else {
		await recordParticipantTokenAnomaly(tx, anomaly);
	}

	return null;
}
