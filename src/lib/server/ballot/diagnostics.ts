import {
	participantTokenAnomaly,
	type ParticipantTokenAnomalyPayload
} from '#lib/server/db/schema/participation.js';
import { db } from '#lib/server/db/index.js';
import type { BallotTransaction } from './types.js';

export type ParticipantTokenAnomalyName =
	'participant_token_unrecognized' | 'participant_token_wrong_meeting';

export type ParticipantTokenAnomalyInput = {
	name: ParticipantTokenAnomalyName;
	meetingId?: string;
	voteId?: string;
	operation: ParticipantTokenAnomalyPayload['operation'];
	tokenState: ParticipantTokenAnomalyPayload['tokenState'];
};

async function insertParticipantTokenAnomaly(
	tx: BallotTransaction,
	{ name, meetingId, voteId, operation, tokenState }: ParticipantTokenAnomalyInput
) {
	// Meeting and vote IDs deduplicate normal diagnostics. Nullable foreign keys let them survive
	// cleanup without blocking deletion of the related rows.
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

export async function recordParticipantTokenAnomaly(
	tx: BallotTransaction,
	input: ParticipantTokenAnomalyInput
) {
	return insertParticipantTokenAnomaly(tx, input);
}

export async function recordParticipantTokenAnomalyBestEffort(input: ParticipantTokenAnomalyInput) {
	try {
		// Do not use the repeatable-read projection transaction for this write. PostgreSQL 18.6
		// reproduced SQLSTATE 40001 when concurrent diagnostic inserts raced there; a savepoint
		// cannot make that serialization failure safe to continue. An independent short transaction
		// keeps the projection's snapshot and transaction usable if this non-essential write fails.
		await db.transaction((tx) => insertParticipantTokenAnomaly(tx, input));
	} catch {
		// Participant-token diagnostics are best effort and must never fail the page projection.
	}
}
