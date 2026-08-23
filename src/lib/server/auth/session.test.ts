import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => ({
	getRequestEvent: vi.fn()
}));

import { getOrganizerSession } from './session.js';

describe('Organizer session lookup', () => {
	it('returns an empty session for anonymous or incomplete locals', () => {
		expect(getOrganizerSession({ locals: {} })).toEqual({ user: null, session: null });
		expect(
			getOrganizerSession({
				locals: {
					user: {
						id: 'user-id',
						name: 'Organizer',
						email: 'organizer@example.test',
						emailVerified: true,
						image: null,
						createdAt: new Date(),
						updatedAt: new Date()
					}
				}
			})
		).toEqual({ user: null, session: null });
	});

	it('returns the authenticated Organizer user and session together', () => {
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

		expect(getOrganizerSession({ locals: { user, session } })).toEqual({ user, session });
	});
});
