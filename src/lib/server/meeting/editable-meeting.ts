import { and, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { meetingPubSub } from '#lib/server/pubsub.js';
import type { CommittedMeetingResult } from './types.js';

type MeetingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type MutationResult<T> = {
	value: T;
	changed: boolean;
};

type EditableMeetingMutation<T> = {
	organizerUserId: string;
	meetingId: string;
	mutate: (tx: MeetingTransaction) => Promise<MutationResult<T>>;
};

// Keep the ownership check, mutation, and revision update in one transaction.
export async function mutateEditableMeeting<T>({
	organizerUserId,
	meetingId,
	mutate
}: EditableMeetingMutation<T>) {
	const committed = await db.transaction(async (tx): Promise<CommittedMeetingResult<T> | null> => {
		const [ownedMeeting] = await tx
			.select({ id: meeting.id })
			.from(meeting)
			.where(
				and(
					eq(meeting.id, meetingId),
					eq(meeting.organizerUserId, organizerUserId),
					sql`${meeting.lifecycle} <> 'closed'`
				)
			)
			.for('update')
			.limit(1);

		if (!ownedMeeting) return null;

		const result = await mutate(tx);

		if (!result.changed) return { value: result.value, revision: null };

		const [updated] = await tx
			.update(meeting)
			.set({ revision: sql`${meeting.revision} + 1` })
			.where(eq(meeting.id, meetingId))
			.returning({ revision: meeting.revision });

		return { value: result.value, revision: updated.revision };
	});

	if (committed && committed.revision !== null) {
		meetingPubSub.publish(meetingId, committed.revision);
	}

	return committed?.value ?? null;
}
