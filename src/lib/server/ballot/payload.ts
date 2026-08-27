import { z } from 'zod';
import { DECISION_BALLOT_CHOICES } from '#lib/vote/ballot.js';

export const storedBallotPayloadSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('decision'),
		choice: z.enum(DECISION_BALLOT_CHOICES)
	}),
	z.object({
		type: z.literal('selection'),
		selectedOptionIds: z.array(z.uuidv7()),
		vacancyCount: z.number().int().nonnegative(),
		abstain: z.boolean()
	})
]);

export type StoredBallotPayload = z.infer<typeof storedBallotPayloadSchema>;
