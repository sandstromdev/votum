import type { PageServerLoad } from './$types';
import { participantMeeting } from '#lib/remotes/meeting.remote.js';

export const load = (async ({ params }) => {
	return {
		publicLocator: params.locator,
		projection: await participantMeeting({ publicLocator: params.locator })
	};
}) satisfies PageServerLoad;
