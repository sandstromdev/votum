import { INITIAL_SUBMISSION_KEY_REQUIRED_MESSAGE } from '#lib/schemas/ballot.js';
import { STALE_ACTIVE_VOTE_MESSAGE } from '#lib/vote/ballot.js';

export const BALLOT_ERRORS = {
	initial_submission_key_required: {
		message: INITIAL_SUBMISSION_KEY_REQUIRED_MESSAGE,
		httpStatus: 400
	},
	initial_submission_conflict: {
		message: 'Nyckeln har redan använts med en annan röst. Ladda om sidan och försök igen.',
		httpStatus: 409
	},
	stale_active_vote: {
		message: STALE_ACTIVE_VOTE_MESSAGE,
		httpStatus: 409
	}
} as const satisfies Record<string, { message: string; httpStatus: number }>;

export type BallotErrorCode = keyof typeof BALLOT_ERRORS;

export class BallotError<TCode extends BallotErrorCode = BallotErrorCode> extends Error {
	readonly code: TCode;
	readonly httpStatus: number;

	constructor(code: TCode, { cause }: { cause?: unknown } = {}) {
		super(BALLOT_ERRORS[code].message, { cause });
		this.name = 'BallotError';
		this.code = code;
		this.httpStatus = BALLOT_ERRORS[code].httpStatus;
	}

	is<T extends TCode>(code: T): this is BallotError<T> {
		return this.code === code;
	}
}

export function isBallotError(error: unknown): error is BallotError<BallotErrorCode>;
export function isBallotError<TCode extends BallotErrorCode>(
	error: unknown,
	code: TCode
): error is BallotError<TCode>;
export function isBallotError(error: unknown, code?: BallotErrorCode) {
	return error instanceof BallotError && (code === undefined || error.is(code));
}
