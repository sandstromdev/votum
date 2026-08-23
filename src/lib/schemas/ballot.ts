import z from 'zod';
import { DECISION_BALLOT_CHOICES } from '#lib/vote/ballot.js';
import { publicLocatorSchema } from './meeting.js';

const activeVoteKey = z.string().trim().min(1);

export const submitDecisionBallotSchema = z
	.object({
		publicLocator: publicLocatorSchema,
		activeVoteKey,
		choice: z.enum(DECISION_BALLOT_CHOICES).optional(),
		action: z.enum(['cast', 'withdraw'])
	})
	.superRefine((input, ctx) => {
		if (input.action === 'cast' && !input.choice) {
			ctx.addIssue({
				code: 'custom',
				path: ['choice'],
				message: 'Du måste välja ett alternativ.'
			});
		}
	});

export const submitSelectionBallotSchema = z
	.object({
		publicLocator: publicLocatorSchema,
		activeVoteKey,
		selectedOptionIds: z.array(z.uuidv7()).default([]),
		vacancyCount: z.number().int().nonnegative().default(0),
		action: z.enum(['cast', 'withdraw']),
		abstain: z.boolean().default(false)
	})
	.superRefine(({ action, abstain, selectedOptionIds, vacancyCount }, ctx) => {
		if (action === 'withdraw') return;

		if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['selectedOptionIds'],
				message: 'Du kan inte välja samma alternativ flera gånger.'
			});
		}

		if (selectedOptionIds.length === 0 && !abstain && vacancyCount === 0) {
			ctx.addIssue({
				code: 'custom',
				path: ['abstain'],
				message: 'Du måste välja ett alternativ eller markera att du vill avstå.'
			});
		}

		if (selectedOptionIds.length > 0 && abstain) {
			ctx.addIssue({
				code: 'custom',
				path: ['abstain'],
				message: 'Du kan inte välja ett alternativ och avstå samtidigt.'
			});
		}
	});

export type SubmitDecisionBallotInput = z.infer<typeof submitDecisionBallotSchema>;
export type SubmitSelectionBallotInput = z.infer<typeof submitSelectionBallotSchema>;
