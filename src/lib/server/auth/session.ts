import { getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const ORGANIZER_AUTHORIZATION_ERROR = 'Du måste vara inloggad som organisatör.';

/** Allows only authenticated Organizer accounts to run meeting commands. */
export function requireOrganizerSession(event: Pick<RequestEvent, 'locals'> = getRequestEvent()) {
	if (!event.locals.user || !event.locals.session) {
		error(401, ORGANIZER_AUTHORIZATION_ERROR);
	}

	return {
		user: event.locals.user,
		session: event.locals.session
	};
}
export function getOrganizerSession(event: Pick<RequestEvent, 'locals'> = getRequestEvent()) {
	if (!event.locals.user || !event.locals.session) {
		return {
			user: null,
			session: null
		};
	}

	return {
		user: event.locals.user,
		session: event.locals.session
	};
}
