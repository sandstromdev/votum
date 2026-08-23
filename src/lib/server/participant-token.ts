import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';

export function participantTokenCookieName(publicLocator: string) {
	return `votum-participant-token:${publicLocator}`;
}

export function getParticipantToken(event: Pick<RequestEvent, 'cookies'>, publicLocator: string) {
	return event.cookies.get(participantTokenCookieName(publicLocator));
}

export function setParticipantToken(
	event: Pick<RequestEvent, 'cookies'>,
	publicLocator: string,
	token: string
) {
	event.cookies.set(participantTokenCookieName(publicLocator), token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		path: '/'
	});
}
