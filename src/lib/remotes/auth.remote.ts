import { form, getRequestEvent } from '$app/server';
import { invalid, redirect } from '@sveltejs/kit';
import { GENERIC_AUTH_ERROR_MESSAGE, loginSchema } from '#lib/schemas/auth.js';
import { auth } from '#lib/server/auth/config.js';

export const login = form(loginSchema, async ({ email, _password }) => {
	const event = getRequestEvent();

	try {
		await auth.api.signInEmail({
			body: { email, password: _password },
			headers: event.request.headers
		});
	} catch {
		// Do not expose or log Better Auth errors: they may contain credential or request details.
		invalid(GENERIC_AUTH_ERROR_MESSAGE);
	}

	redirect(303, '/organisera');
});

export const logout = form(async () => {
	const event = getRequestEvent();

	await auth.api.signOut({ headers: event.request.headers });
	redirect(303, '/');
});
