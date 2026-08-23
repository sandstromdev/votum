import { getOrganizerSession } from '#lib/server/auth/session.js';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load = (async (event) => {
	const { user } = getOrganizerSession(event);

	if (!user) {
		redirect(303, '/logga-in');
	}

	return {
		organizer: {
			name: user.name,
			email: user.email
		}
	};
}) satisfies LayoutServerLoad;
