import * as Sentry from '@sentry/sveltekit';
import { SENTRY_DSN } from '$app/env/public';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: 1.0,
	enableLogs: true,
	dataCollection: {
		userInfo: false,
		httpBodies: []
	}
});
