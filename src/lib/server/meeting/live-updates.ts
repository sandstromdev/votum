import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { meetingPubSub } from '#lib/server/pubsub.js';

function snapshotRevision<T>(snapshot: T) {
	if (typeof snapshot !== 'object' || snapshot === null || !('revision' in snapshot)) return -1;
	return typeof snapshot.revision === 'number' ? snapshot.revision : -1;
}

export async function* liveMeetingSnapshots<T>(
	meetingId: string,
	read: () => Promise<T>,
	signal: AbortSignal
) {
	const pending = meetingPubSub.listen(meetingId, signal);
	let nextRevision = pending.next();

	try {
		let snapshot = await read();
		yield snapshot;

		while (true) {
			const currentRevision = snapshotRevision(snapshot);

			const update = await nextRevision;
			if (update.done) return;

			nextRevision = pending.next();

			if (update.value <= currentRevision) {
				continue;
			}

			const nextSnapshot = await read();

			if (snapshotRevision(nextSnapshot) <= currentRevision) {
				continue;
			}

			snapshot = nextSnapshot;

			yield snapshot;
		}
	} finally {
		await pending.return();
	}
}

export async function readOwnedMeetingIdByLocator(organizerUserId: string, publicLocator: string) {
	const [row] = await db
		.select({ id: meeting.id })
		.from(meeting)
		.where(
			and(eq(meeting.organizerUserId, organizerUserId), eq(meeting.publicLocator, publicLocator))
		)
		.limit(1);
	return row?.id ?? null;
}
