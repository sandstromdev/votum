import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => ({
	getRequestEvent: vi.fn()
}));
import { hashPassword } from 'better-auth/crypto';
import { loginSchema } from '#lib/schemas/auth.js';
import {
	auth,
	GENERIC_AUTH_ERROR_MESSAGE,
	genericAuthFailureResponse,
	getValidSession,
	handleAuthRequest,
	ORGANIZER_SESSION_ABSOLUTE_MILLISECONDS,
	ORGANIZER_SESSION_ABSOLUTE_SECONDS,
	ORGANIZER_SESSION_IDLE_SECONDS
} from './config.js';
import { ORGANIZER_AUTHORIZATION_ERROR, requireOrganizerSession } from './session.js';

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgres://root:mysecretpassword@localhost:5432/local';
const sql = postgres(DATABASE_URL, { max: 1 });
const createdUserIds: string[] = [];
const TEST_PASSWORD = 'correct horse battery staple';

async function provisionOrganizer(password: string) {
	const userId = randomUUID();
	const email = `${userId}@example.test`;
	const now = new Date();
	const passwordHash = await hashPassword(password);

	await sql.begin(async (tx) => {
		await tx`
			INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES (${userId}, 'Organizer', ${email}, true, ${now}, ${now})
		`;
		await tx`
			INSERT INTO account (
				id, issuer, account_id, provider_id, user_id, password, created_at, updated_at
			)
			VALUES (
				${randomUUID()}, 'local:credential', ${userId}, 'credential', ${userId},
				${passwordHash}, ${now}, ${now}
			)
		`;
	});

	createdUserIds.push(userId);

	return { email, userId };
}

function signInRequest(email: string, password: string) {
	return new Request('http://localhost:5173/api/auth/sign-in/email', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: 'http://localhost:5173'
		},
		body: JSON.stringify({ email, password })
	});
}

function cookieFrom(response: Response) {
	const setCookie = response.headers.get('set-cookie');

	if (!setCookie) {
		throw new Error('Expected Better Auth to set a session cookie');
	}

	return setCookie.split(';', 1)[0];
}

async function signInOrganizer(email: string, password: string) {
	const response = await handleAuthRequest(signInRequest(email, password));

	return { response, cookie: cookieFrom(response) };
}

async function createAuthenticatedOrganizer(password = TEST_PASSWORD) {
	const organizer = await provisionOrganizer(password);
	const { response, cookie } = await signInOrganizer(organizer.email, password);

	return { ...organizer, response, cookie };
}

function requestWithCookie(path: string, cookie: string, body?: unknown) {
	return new Request(`http://localhost:5173/api/auth${path}`, {
		method: 'POST',
		headers: {
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
			cookie,
			origin: 'http://localhost:5173'
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
}

describe('Organizer authentication policy', () => {
	beforeAll(async () => {
		await sql`SELECT 1`;
	});

	afterEach(async () => {
		if (createdUserIds.length === 0) {
			return;
		}
		for (const userId of createdUserIds) {
			await sql`DELETE FROM "user" WHERE id = ${userId}`;
		}
		createdUserIds.length = 0;
	});

	afterAll(async () => {
		await sql.end();
	});

	it('uses the resolved Organizer session and account policy', () => {
		expect(auth.options.emailAndPassword?.enabled).toBe(true);
		expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
		expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
		expect(auth.options.session?.expiresIn).toBe(ORGANIZER_SESSION_IDLE_SECONDS);
		expect(auth.options.session?.cookieCache?.enabled).toBe(false);
		expect(auth.options.rateLimit?.storage).toBe('database');
		expect(auth.options.disabledPaths).toContain('/change-password');
	});

	it('rejects anonymous Organizer control access and accepts an authenticated boundary', () => {
		expect(() => requireOrganizerSession({ locals: {} })).toThrow(
			expect.objectContaining({
				status: 401,
				body: expect.objectContaining({ message: ORGANIZER_AUTHORIZATION_ERROR })
			})
		);

		const now = new Date();
		const user = {
			id: 'user-id',
			name: 'Organizer',
			email: 'organizer@example.test',
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now
		} satisfies NonNullable<App.Locals['user']>;
		const session = {
			id: 'session-id',
			userId: user.id,
			expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
			token: 'session-token',
			createdAt: now,
			updatedAt: now,
			ipAddress: null,
			userAgent: null
		} satisfies NonNullable<App.Locals['session']>;

		expect(requireOrganizerSession({ locals: { user, session } })).toEqual({ user, session });
	});

	it('allows an externally provisioned verified Organizer to sign in', async () => {
		const { response, userId } = await createAuthenticatedOrganizer();

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ user: { id: userId } });
	});

	it('uses one generic Swedish response for invalid credentials', async () => {
		const organizer = await provisionOrganizer(TEST_PASSWORD);
		const response = await handleAuthRequest(signInRequest(organizer.email, 'wrong password'));
		const body = await response.text();

		expect(response.status).toBe(401);
		expect(body).toBe(JSON.stringify({ message: GENERIC_AUTH_ERROR_MESSAGE }));
		expect(body).not.toContain('wrong password');
		expect(body).not.toContain(organizer.email);
		expect(body).not.toContain('INVALID_EMAIL_OR_PASSWORD');
	});

	it('uses the same generic Swedish response for rate-limit failures', async () => {
		const response = genericAuthFailureResponse(
			new Response(JSON.stringify({ message: 'Too many requests. Please try again later.' }), {
				status: 429,
				headers: { 'x-retry-after': '10' }
			})
		);

		expect(response.status).toBe(429);
		expect(response.headers.get('x-retry-after')).toBe('10');
		expect(await response.text()).toBe(JSON.stringify({ message: GENERIC_AUTH_ERROR_MESSAGE }));
	});

	it('uses field-specific messages for invalid remote-form credentials', () => {
		const result = loginSchema.safeParse({ email: 'not-an-email', _password: '' });

		expect(result.success).toBe(false);
		if (result.success) {
			return;
		}
		expect(result.error.issues.map((issue) => issue.message)).toEqual([
			'Ange en giltig e-postadress, till exempel namn@exempel.se.',
			'Ange ditt lösenord.'
		]);
	});

	it('revokes the current session immediately on logout', async () => {
		const { cookie } = await createAuthenticatedOrganizer();

		expect(await getValidSession({ cookie })).not.toBeNull();
		const logoutResponse = await handleAuthRequest(requestWithCookie('/sign-out', cookie));

		expect(logoutResponse.status).toBe(200);
		expect(await getValidSession({ cookie })).toBeNull();
	});

	it('rejects sessions after the idle expiry', async () => {
		const { userId, cookie } = await createAuthenticatedOrganizer();

		await sql`
			UPDATE session
			SET expires_at = now() - interval '1 minute'
			WHERE user_id = ${userId}
		`;

		expect(await getValidSession({ cookie })).toBeNull();
	});

	it('refreshes the idle window while keeping the absolute lifetime cap', async () => {
		const { userId, cookie } = await createAuthenticatedOrganizer();

		await sql`
			UPDATE session
			SET created_at = now() - interval '23 hours',
				expires_at = now() + interval '30 minutes'
			WHERE user_id = ${userId}
		`;

		expect(await getValidSession({ cookie })).not.toBeNull();

		const [session] = await sql<
			{
				idle_was_extended: boolean;
				absolute_cap_respected: boolean;
			}[]
		>`
			SELECT
				expires_at > now() + interval '30 minutes' AS idle_was_extended,
				expires_at <= created_at + interval '24 hours' AS absolute_cap_respected
			FROM session
			WHERE user_id = ${userId}
		`;

		expect(session.idle_was_extended).toBe(true);
		expect(session.absolute_cap_respected).toBe(true);
	});

	it('rejects sessions after the absolute expiry even when idle expiry was refreshed', async () => {
		const { userId, cookie } = await createAuthenticatedOrganizer();

		await sql`
			UPDATE session
			SET created_at = now() - interval '25 hours',
				expires_at = now() + interval '7 hours'
			WHERE user_id = ${userId}
		`;

		expect(await getValidSession({ cookie })).toBeNull();
		expect(ORGANIZER_SESSION_ABSOLUTE_SECONDS).toBe(24 * 60 * 60);
		expect(ORGANIZER_SESSION_ABSOLUTE_MILLISECONDS).toBe(24 * 60 * 60 * 1000);
	});

	it('rejects change and reset password requests', async () => {
		const { cookie } = await createAuthenticatedOrganizer();

		const changePasswordResponse = await handleAuthRequest(
			requestWithCookie('/change-password', cookie)
		);

		expect(changePasswordResponse.status).toBe(404);
		expect(await changePasswordResponse.text()).toBe('');

		const resetPasswordResponse = await handleAuthRequest(
			requestWithCookie('/reset-password', cookie)
		);

		expect(resetPasswordResponse.status).toBe(404);
		expect(await resetPasswordResponse.text()).toBe('');

		const requestPasswordResetResponse = await handleAuthRequest(
			requestWithCookie('/request-password-reset', cookie)
		);

		expect(requestPasswordResetResponse.status).toBe(404);
		expect(await requestPasswordResetResponse.text()).toBe('');
	});
});
