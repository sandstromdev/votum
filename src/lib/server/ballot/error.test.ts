import { describe, expect, it } from 'vitest';
import { INITIAL_SUBMISSION_KEY_REQUIRED_MESSAGE } from '#lib/schemas/ballot.js';
import { STALE_ACTIVE_VOTE_MESSAGE } from '#lib/vote/ballot.js';
import { BallotError, BALLOT_ERRORS } from './error.js';

describe('Ballot errors', () => {
	it('keeps the catalog as the single source of truth for error messages', () => {
		const expectedMessages = [
			{
				code: 'initial_submission_key_required',
				message: INITIAL_SUBMISSION_KEY_REQUIRED_MESSAGE
			},
			{
				code: 'initial_submission_conflict',
				message: 'Nyckeln har redan använts med en annan röst. Ladda om sidan och försök igen.'
			},
			{ code: 'stale_active_vote', message: STALE_ACTIVE_VOTE_MESSAGE }
		] as const;

		for (const { code, message } of expectedMessages) {
			const error = new BallotError(code);
			expect(error.message).toBe(message);
			expect(error.message).toBe(BALLOT_ERRORS[code].message);
		}
	});

	it('keeps HTTP metadata and cause support without allowing message overrides', () => {
		const cause = new Error('database detail');
		const error = new BallotError('stale_active_vote', { cause });

		expect(error.httpStatus).toBe(BALLOT_ERRORS.stale_active_vote.httpStatus);
		expect(error.message).toBe(BALLOT_ERRORS.stale_active_vote.message);
		expect(error.cause).toBe(cause);
	});
});
