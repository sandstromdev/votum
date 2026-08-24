import * as Sentry from '@sentry/sveltekit';

function getErrorStatus(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null || !('status' in error)) {
		return undefined;
	}

	const { status } = error;

	return typeof status === 'number' ? status : undefined;
}

export function captureError(error: unknown) {
	const status = getErrorStatus(error);

	if (status !== undefined && status >= 400 && status < 500) {
		return;
	}

	Sentry.captureException(error);
}
