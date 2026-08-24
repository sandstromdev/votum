import * as Sentry from '@sentry/sveltekit';
import { type Handle, type HandleServerError, sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth, getValidSession, handleAuthRequest } from '#lib/server/auth/config.js';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { captureError } from '#lib/error-reporting.js';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await getValidSession(event.request.headers);

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	if (isAuthPath(event.url.toString(), auth.options)) {
		// Better Auth's handler cannot normalize error bodies or enforce the absolute session cap.
		if (building) return resolve(event);
		return handleAuthRequest(event.request);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(Sentry.sentryHandle(), handleBetterAuth);
export const handleError: HandleServerError = ({ error }) => captureError(error);
