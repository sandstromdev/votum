import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { storedBallotPayloadSchema } from './payload.js';

describe('stored Ballot payloads', () => {
	it('accepts the persisted Decision and Selection shapes', () => {
		expect(
			storedBallotPayloadSchema.safeParse({ type: 'decision', choice: 'support' })
		).toMatchObject({ success: true });

		expect(
			storedBallotPayloadSchema.safeParse({
				type: 'selection',
				selectedOptionIds: [uuidv7()],
				vacancyCount: 1,
				abstain: false
			})
		).toMatchObject({ success: true });
	});

	it('rejects malformed or unsafe persisted values', () => {
		const invalidPayloads: unknown[] = [
			{ type: 'decision', choice: 'maybe' },
			{ type: 'selection', selectedOptionIds: ['not-a-uuid'], vacancyCount: 0 },
			{ type: 'selection', selectedOptionIds: [], vacancyCount: -1 },
			{ type: 'unknown' }
		];

		for (const payload of invalidPayloads) {
			expect(storedBallotPayloadSchema.safeParse(payload)).toMatchObject({ success: false });
		}
	});
});
