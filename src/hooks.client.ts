import { handleErrorWithSentry } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { SENTRY_DSN } from '$app/env/public';

if (SENTRY_DSN) {
	Sentry.init({
		dsn: SENTRY_DSN,
		tunnel: '/api/issue',
		tracesSampleRate: 1.0,
		enableLogs: true,
		dataCollection: {
			userInfo: false,
			httpBodies: []
		}
	});
}

export const handleError = handleErrorWithSentry();
