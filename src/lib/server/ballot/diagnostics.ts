import { and, eq } from 'drizzle-orm';
import {
	participantTokenAnomaly,
	type ParticipantTokenAnomalyPayload
} from '#lib/server/db/schema/participation.js';
import type { BallotTransaction } from './types.js';

export type ParticipantTokenAnomalyName =
	'participant_token_unrecognized' | 'participant_token_wrong_meeting';

export async function recordParticipantTokenAnomaly(
	tx: BallotTransaction,
	{
		name,
		meetingId,
		voteId,
		operation,
		tokenState
	}: {
		name: ParticipantTokenAnomalyName;
		meetingId?: string;
		voteId?: string;
		operation: ParticipantTokenAnomalyPayload['operation'];
		tokenState: ParticipantTokenAnomalyPayload['tokenState'];
	}
) {
	// Meeting and vote IDs deduplicate normal diagnostics. Nullable foreign keys let them survive
	// cleanup without blocking deletion of the related rows.
	if (meetingId && voteId) {
		const [existing] = await tx
			.select({ id: participantTokenAnomaly.id })
			.from(participantTokenAnomaly)
			.where(
				and(
					eq(participantTokenAnomaly.meetingId, meetingId),
					eq(participantTokenAnomaly.voteId, voteId),
					eq(participantTokenAnomaly.name, name)
				)
			)
			.limit(1);
		if (existing) return;
	}

	await tx
		.insert(participantTokenAnomaly)
		.values({
			name,
			meetingId: meetingId ?? null,
			voteId: voteId ?? null,
			payload: { operation, tokenState }
		})
		.onConflictDoNothing();
}
