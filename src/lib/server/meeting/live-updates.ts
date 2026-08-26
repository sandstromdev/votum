import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { meetingPubSub, type MeetingSubscriptionOptions } from '#lib/server/pubsub.js';
import { timingEnd, timingStart, withTiming, type TimingContext } from '#lib/server/timing.js';

function snapshotRevision<T>(snapshot: T) {
	if (typeof snapshot !== 'object' || snapshot === null || !('revision' in snapshot)) return -1;
	return typeof snapshot.revision === 'number' ? snapshot.revision : -1;
}

export async function* liveMeetingSnapshots<T>(
	meetingId: string,
	read: () => Promise<T>,
	signal: AbortSignal,
	timing?: TimingContext,
	options?: MeetingSubscriptionOptions
) {
	const pending = meetingPubSub.listen(meetingId, signal, options);
	let nextRevision = pending.next();

	try {
		let snapshot = await read();
		if (timing) {
			const startedAt = timingStart(timing, 'organizer.snapshot_yield');
			try {
				yield snapshot;
			} finally {
				timingEnd(timing, 'organizer.snapshot_yield', startedAt, 'success');
			}
		} else {
			yield snapshot;
		}

		while (true) {
			const currentRevision = snapshotRevision(snapshot);

			const update = await nextRevision;
			if (update.done) return;

			nextRevision = pending.next();
			const event = update.value;
			if (!event) continue;

			let shouldRead = false;
			if (!('revision' in event)) {
				shouldRead = true;
			} else if (event.ballotActivity) {
				shouldRead = true;
			} else {
				shouldRead = event.revision > currentRevision;
			}
			if (!shouldRead) {
				continue;
			}

			const nextSnapshot = timing
				? await withTiming(timing, 'organizer.reread', read, event.sourceCorrelationId)
				: await read();

			if (
				'revision' in event &&
				!event.ballotActivity &&
				snapshotRevision(nextSnapshot) <= currentRevision
			) {
				continue;
			}

			snapshot = nextSnapshot;

			if (timing) {
				const startedAt = timingStart(
					timing,
					'organizer.snapshot_yield',
					event.sourceCorrelationId
				);
				try {
					yield snapshot;
				} finally {
					timingEnd(
						timing,
						'organizer.snapshot_yield',
						startedAt,
						'success',
						event.sourceCorrelationId
					);
				}
			} else {
				yield snapshot;
			}
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
