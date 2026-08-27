import { and, eq, inArray } from 'drizzle-orm';
import { ballot } from '#lib/server/db/schema/participation.js';
import { selectionOption } from '#lib/server/db/schema/vote.js';
import type { ParticipantBallot } from '#lib/vote/meeting.js';
import { storedBallotPayloadSchema } from './payload.js';
import { resolveParticipantToken } from './token-resolution.js';
import type { ParticipantTokenAnomalyInput } from './diagnostics.js';
import type { BallotTransaction } from './types.js';

export async function readCurrentParticipantBallot(
	tx: BallotTransaction,
	{
		meetingId,
		voteId,
		rawParticipantToken,
		recordTokenAnomaly,
		onTokenAnomaly
	}: {
		meetingId: string;
		voteId: string;
		rawParticipantToken?: string;
		recordTokenAnomaly?: boolean;
		onTokenAnomaly?: (input: ParticipantTokenAnomalyInput) => void;
	}
): Promise<ParticipantBallot | null> {
	// The caller supplies the locked open vote, so a token can only read its ballot for that vote.
	const token = await resolveParticipantToken(tx, {
		meetingId,
		voteId,
		rawParticipantToken,
		operation: 'read',
		recordTokenAnomaly,
		onTokenAnomaly
	});

	if (!token) {
		return null;
	}

	const [currentBallot] = await tx
		.select({ payload: ballot.payload })
		.from(ballot)
		.where(
			and(
				eq(ballot.meetingId, meetingId),
				eq(ballot.voteId, voteId),
				eq(ballot.participantTokenId, token.id)
			)
		)
		.limit(1);

	if (!currentBallot) {
		return null;
	}

	const payload = storedBallotPayloadSchema.parse(currentBallot.payload);

	if (payload.type === 'decision') {
		return payload;
	}

	if (payload.selectedOptionIds.length > 0) {
		const optionRows = await tx
			.select({ id: selectionOption.id })
			.from(selectionOption)
			.where(
				and(
					eq(selectionOption.voteId, voteId),
					inArray(selectionOption.id, payload.selectedOptionIds)
				)
			);

		if (optionRows.length !== payload.selectedOptionIds.length) {
			throw new Error('Selection Ballot references an option from another Vote.');
		}
	}

	return {
		type: 'selection',
		selectedOptionIds: payload.selectedOptionIds,
		vacancyCount: payload.vacancyCount,
		abstain: payload.abstain
	};
}
