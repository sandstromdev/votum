import { building } from '$app/env';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { ORIGIN } from '$app/env/public';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { GENERIC_AUTH_ERROR_MESSAGE } from '#lib/schemas/auth.js';
import { db } from '#lib/server/db/index.js';
import * as schema from '#lib/server/db/schema/auth.js';

// Better Auth uses seconds for session settings; Date uses milliseconds.
export const ORGANIZER_SESSION_IDLE_SECONDS = 8 * 60 * 60;
export const ORGANIZER_SESSION_ABSOLUTE_SECONDS = 24 * 60 * 60;
export const ORGANIZER_SESSION_ABSOLUTE_MILLISECONDS = ORGANIZER_SESSION_ABSOLUTE_SECONDS * 1000;
export const ORGANIZER_SESSION_UPDATE_AGE_SECONDS = 60 * 60;
export { GENERIC_AUTH_ERROR_MESSAGE };

// SvelteKit evaluates this module during the build, so provide temporary auth values then.
const authSecret = building ? randomBytes(32).toString('base64url') : BETTER_AUTH_SECRET;
const authOrigin = building ? 'http://localhost:5173' : ORIGIN;

export const auth = betterAuth({
	baseURL: authOrigin,
	secret: authSecret,
	logger: {
		level: process.env.NODE_ENV === 'production' ? 'error' : 'warn'
	},
	database: drizzleAdapter(db, { provider: 'pg', schema }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		requireEmailVerification: true
	},
	session: {
		// Better Auth refreshes this expiry after updateAge, so it defines the idle window.
		expiresIn: ORGANIZER_SESSION_IDLE_SECONDS,
		updateAge: ORGANIZER_SESSION_UPDATE_AGE_SECONDS,
		cookieCache: { enabled: false }
	},
	rateLimit: {
		enabled: process.env.NODE_ENV === 'production',
		storage: 'database'
	},
	advanced: {
		useSecureCookies: process.env.NODE_ENV === 'production',
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: 'lax'
		}
	},
	// Password recovery and password changes are not part of v1.
	disabledPaths: [
		'/request-password-reset',
		'/reset-password',
		'/reset-password/*',
		'/change-password'
	],
	databaseHooks: {
		session: {
			update: {
				before: async (session, context) => {
					const createdAt = context?.context.session?.session.createdAt;

					if (!(createdAt instanceof Date) || session.expiresAt === undefined) {
						return undefined;
					}

					const absoluteExpiry = new Date(
						createdAt.getTime() + ORGANIZER_SESSION_ABSOLUTE_MILLISECONDS
					);
					const requestedExpiry = new Date(session.expiresAt);

					if (requestedExpiry < absoluteExpiry) {
						return undefined;
					}

					return { data: { expiresAt: absoluteExpiry } };
				}
			}
		}
	},
	// The cookie bridge needs a RequestEvent. Auth API tests use response headers instead.
	plugins: process.env.NODE_ENV === 'test' ? [] : [sveltekitCookies(getRequestEvent)]
});

/** Enforces the absolute session lifetime in addition to Better Auth's idle expiry. */
export async function getValidSession(headers: HeadersInit) {
	const session = await auth.api.getSession({ headers });

	if (!session) {
		return null;
	}

	const absoluteExpiry =
		new Date(session.session.createdAt).getTime() + ORGANIZER_SESSION_ABSOLUTE_MILLISECONDS;

	if (Date.now() < absoluteExpiry) {
		return session;
	}

	await db.delete(schema.session).where(eq(schema.session.token, session.session.token));

	return null;
}

/** Normalizes sign-in and rate-limit errors without exposing auth details. */
export async function handleAuthRequest(request: Request) {
	await getValidSession(request.headers);

	const pathname = new URL(request.url).pathname;

	const isDisabledPasswordPath =
		pathname.includes('/request-password-reset') ||
		pathname.includes('/reset-password') ||
		pathname.endsWith('/change-password');

	if (isDisabledPasswordPath) {
		return new Response(null, { status: 404 });
	}

	const response = await auth.handler(request);
	const isEmailSignIn = pathname.endsWith('/sign-in/email');
	const isRateLimitFailure = response.status === 429;

	if (!isRateLimitFailure && !(isEmailSignIn && response.status >= 400)) {
		return response;
	}

	return genericAuthFailureResponse(response);
}

/** Replaces the body while preserving the response status, headers, and cookies. */
export function genericAuthFailureResponse(response: Response) {
	const headers = new Headers(response.headers);

	headers.delete('content-length');
	headers.set('content-type', 'application/json');

	return new Response(JSON.stringify({ message: GENERIC_AUTH_ERROR_MESSAGE }), {
		status: response.status,
		headers
	});
}
