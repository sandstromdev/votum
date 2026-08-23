import { getOrganizerMeetingByLocator } from '#lib/remotes/meeting.remote.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	return {
		meeting: await getOrganizerMeetingByLocator({ publicLocator: params.locator })
	};
}) satisfies PageServerLoad;
