import * as Sentry from '@sentry/sveltekit';
import { SENTRY_DSN, SENTRY_TRACE_SAMPLE_RATE } from '$app/env/public';
import type { HandleClientError } from '@sveltejs/kit/hooks';
import { captureError } from '#lib/error-reporting.js';

if (SENTRY_DSN) {
	Sentry.init({
		dsn: SENTRY_DSN,
		tunnel: '/api/issue',
		tracesSampleRate: SENTRY_TRACE_SAMPLE_RATE,
		enableLogs: true,
		dataCollection: {
			userInfo: false,
			httpBodies: []
		}
	});
}

export const handleError: HandleClientError = ({ error }) => captureError(error);
