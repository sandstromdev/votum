import { z } from 'zod';
import { VOTE_KINDS } from '#lib/vote/agenda.js';
import { DEFAULT_MAJORITY_RULE, MAJORITY_RULES } from '#lib/vote/majority.js';

const voteTitle = z
	.string()
	.trim()
	.min(1, 'Ange en rubrik för omröstningen.')
	.max(200, 'Rubriken får vara högst 200 tecken.');

const optionalLabel = z.string().trim().max(100, 'Etiketten får vara högst 100 tecken.').optional();

const optionalOptions = z
	.array(z.string().trim().max(100, 'Etiketten får vara högst 100 tecken.'))
	.max(100, 'Du kan ha högst 100 alternativ.')
	.optional();

const draftVoteObject = z.object({
	meetingId: z.uuidv7(),
	voteId: z.uuidv7().optional(),
	title: voteTitle,
	kind: z.enum(VOTE_KINDS),
	supportLabel: optionalLabel,
	opposeLabel: optionalLabel,
	abstentionLabel: optionalLabel,
	majorityRule: z.enum(MAJORITY_RULES).optional(),
	// Checkbox FormData omits unchecked fields, so missing means false rather than the product default.
	abstentionsCounted: z.boolean().default(false),
	positionCount: z.number().int().positive().max(2_147_483_647).optional(),
	vacancyEnabled: z.boolean().default(false),
	options: optionalOptions
});

function requireLabel(ctx: z.RefinementCtx, path: string, value: string | undefined) {
	if (!value) {
		ctx.addIssue({ code: 'custom', path: [path], message: 'Ange en etikett.' });
	}
}

function voteKindRules(input: z.infer<typeof draftVoteObject>, ctx: z.RefinementCtx) {
	if (input.kind === 'decision') {
		requireLabel(ctx, 'supportLabel', input.supportLabel);
		requireLabel(ctx, 'opposeLabel', input.opposeLabel);
		requireLabel(ctx, 'abstentionLabel', input.abstentionLabel);
		if ((input.majorityRule ?? DEFAULT_MAJORITY_RULE) === 'simple' && input.abstentionsCounted) {
			ctx.addIssue({
				code: 'custom',
				path: ['abstentionsCounted'],
				message: 'Du kan bara räkna avståenden vid kvalificerad majoritet.'
			});
		}

		return;
	}

	if (input.positionCount == null) {
		ctx.addIssue({
			code: 'custom',
			path: ['positionCount'],
			message: 'Ange antal platser.'
		});
	}

	const options = input.options ?? [];

	if (options.length === 0 || options.some((option) => !option)) {
		ctx.addIssue({
			code: 'custom',
			path: ['options'],
			message: 'Lägg till minst ett alternativ.'
		});

		return;
	}
	const uniqueKeys = new Set(options.map((option) => option.toLocaleLowerCase('sv-SE')));

	if (uniqueKeys.size !== options.length) {
		ctx.addIssue({
			code: 'custom',
			path: ['options'],
			message: 'Alternativen måste vara unika.'
		});
	}
}

export const draftVoteSchema = draftVoteObject.superRefine(voteKindRules);

export const updateDraftVoteSchema = draftVoteObject
	.extend({ voteId: z.uuidv7() })
	.superRefine(voteKindRules);

export type DraftVoteInput = z.input<typeof draftVoteSchema>;
export type UpdateDraftVoteInput = z.input<typeof updateDraftVoteSchema>;
