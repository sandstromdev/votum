import { presentationMeeting } from '#lib/remotes/meeting.remote.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	return {
		publicLocator: params.locator,
		projection: await presentationMeeting({ publicLocator: params.locator })
	};
}) satisfies PageServerLoad;
