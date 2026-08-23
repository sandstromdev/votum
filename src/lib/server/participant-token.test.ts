import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { describe, expect, it } from 'vitest';
import {
	getParticipantToken,
	participantTokenCookieName,
	setParticipantToken
} from './participant-token.js';

function createCookies() {
	const values = new Map<string, string>();
	let lastSet:
		| {
				name: string;
				value: string;
				options: Parameters<Cookies['set']>[2];
		  }
		| undefined;

	const cookies = {
		get(name: string) {
			return values.get(name);
		},
		getAll() {
			return [...values].map(([name, value]) => ({ name, value }));
		},
		set(name: string, value: string, options: Parameters<Cookies['set']>[2]) {
			values.set(name, value);
			lastSet = { name, value, options };
		},
		delete(name: string) {
			values.delete(name);
		},
		parse() {
			throw new Error('Cookie parsing is not used by this test double.');
		},
		serialize() {
			throw new Error('Cookie serialization is not used by this test double.');
		}
	} satisfies Cookies;

	return {
		cookies,
		get lastSet() {
			return lastSet;
		}
	};
}

describe('Participant token cookies', () => {
	it('uses a Meeting-scoped cookie name and reads the matching value', () => {
		const publicLocator = 'meeting-code';
		const context = createCookies();
		const cookieName = participantTokenCookieName(publicLocator);

		context.cookies.set(cookieName, 'token-value', { path: '/' });

		expect(cookieName).toBe('votum-participant-token:meeting-code');
		expect(getParticipantToken(context, publicLocator)).toBe('token-value');
		expect(getParticipantToken(context, 'other-meeting')).toBeUndefined();
	});

	it('writes an HttpOnly, lax, root-scoped token cookie', () => {
		const context = createCookies();

		setParticipantToken(context, 'meeting-code', 'token-value');

		expect(context.lastSet).toMatchObject({
			name: 'votum-participant-token:meeting-code',
			value: 'token-value',
			options: { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/' }
		});
	});
});
