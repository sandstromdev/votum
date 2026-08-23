/** Checks for PostgreSQL unique_violation (SQLSTATE 23505), including wrapped driver errors. */
export function isUniqueViolation(error: unknown) {
	return sqlState(error) === '23505';
}

export function sqlState(error: unknown) {
	if (error instanceof Error) {
		if (error.cause != null) {
			return sqlState(error.cause);
		}

		if ('code' in error) {
			return error.code;
		}
	}

	return null;
}

export function driverMessage(error: unknown) {
	if (error instanceof Error) {
		if (error.cause instanceof Error) {
			return error.cause.message;
		}

		return error.message;
	}

	return String(error);
}
