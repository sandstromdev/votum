import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	addDraftVote,
	editDraftVote,
	removeDraftVote,
	reorderDraftVotes
} from '#lib/server/agenda/index.js';
import { createDraftMeeting, updateMeetingSettings } from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';

const context = createServerTestContext();
const { sql } = context;

describe('Editable Meeting transaction policy', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('advances the Meeting revision once for each changed agenda mutation', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Revisionsmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const first = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Första',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!first) throw new Error('Expected the first draft Vote to be created');
		expect(await context.getMeetingRevision(created.id)).toBe(1);

		await editDraftVote({
			organizerUserId,
			meetingId: created.id,
			voteId: first.id,
			title: 'Uppdaterad första',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});
		expect(await context.getMeetingRevision(created.id)).toBe(2);

		const second = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Andra',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!second) throw new Error('Expected the second draft Vote to be created');
		expect(await context.getMeetingRevision(created.id)).toBe(3);

		expect(
			await reorderDraftVotes({
				organizerUserId,
				meetingId: created.id,
				orderedVoteIds: [second.id, first.id]
			})
		).toBe(true);
		expect(await context.getMeetingRevision(created.id)).toBe(4);

		expect(
			await reorderDraftVotes({
				organizerUserId,
				meetingId: created.id,
				orderedVoteIds: [second.id, first.id]
			})
		).toBe(true);
		expect(await context.getMeetingRevision(created.id)).toBe(4);

		expect(
			await removeDraftVote({
				organizerUserId,
				meetingId: created.id,
				voteId: second.id
			})
		).toBe(true);
		expect(await context.getMeetingRevision(created.id)).toBe(5);
	});

	it('does not advance revision for rejected or closed Meeting mutations', async () => {
		const organizerUserId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Skyddat revisionsmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const draftInput = {
			meetingId: created.id,
			title: 'Otillåten fråga',
			kind: 'decision' as const,
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		};

		expect(await addDraftVote({ organizerUserId: otherOrganizerId, ...draftInput })).toBeNull();
		expect(
			await updateMeetingSettings({
				organizerUserId: otherOrganizerId,
				meetingId: created.id,
				settings: { expectedParticipantCount: 99 }
			})
		).toBe(false);
		expect(
			await editDraftVote({
				organizerUserId,
				voteId: uuidv7(),
				...draftInput
			})
		).toBeNull();
		expect(
			await removeDraftVote({
				organizerUserId,
				meetingId: created.id,
				voteId: uuidv7()
			})
		).toBe(false);
		expect(
			await reorderDraftVotes({
				organizerUserId,
				meetingId: created.id,
				orderedVoteIds: [uuidv7()]
			})
		).toBe(false);
		expect(await context.getMeetingRevision(created.id)).toBe(0);

		await sql`
				UPDATE meeting
				SET lifecycle = 'closed', opened_at = now(), closed_at = now()
				WHERE id = ${created.id}
			`;

		expect(await addDraftVote({ organizerUserId, ...draftInput })).toBeNull();
		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { expectedParticipantCount: 10 }
			})
		).toBe(false);
		expect(await context.getMeetingRevision(created.id)).toBe(0);
	});

	it('treats an empty settings update as a successful no-op', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Oförändrat möte',
			expectedParticipantCount: 8
		});
		context.trackMeetings(created.id);

		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: {}
			})
		).toBe(true);
		expect(await context.getMeetingRevision(created.id)).toBe(0);
	});
});
