import * as Sentry from '@sentry/sveltekit';
import { SENTRY_DSN, SENTRY_TRACE_SAMPLE_RATE } from '$app/env/public';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: SENTRY_TRACE_SAMPLE_RATE,
	enableLogs: true,
	dataCollection: {
		userInfo: false,
		httpBodies: []
	}
});
