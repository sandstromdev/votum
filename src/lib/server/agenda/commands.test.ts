import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	addDraftVote,
	editDraftVote,
	removeDraftVote,
	reorderDraftVotes,
	saveDraftVote
} from '#lib/server/agenda/index.js';
import { db } from '#lib/server/db/index.js';
import { readAgendaForMeeting } from '#lib/server/agenda/persistence.js';
import { createDraftMeeting } from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';

const context = createServerTestContext();
const { sql } = context;

describe('Agenda commands', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('adds a configured Decision Vote to the end of a Meeting agenda', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const added = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Godkänn budgeten',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});

		expect(added).toMatchObject({
			title: 'Godkänn budgeten',
			kind: 'decision',
			lifecycle: 'draft',
			position: 0,
			decision: {
				supportLabel: 'För',
				opposeLabel: 'Emot',
				abstentionLabel: 'Avstår',
				majorityRule: 'simple',
				abstentionsCounted: false
			}
		});
		expect(await readAgendaForMeeting(db, created.id)).toEqual([added]);
	});

	it('stores Selection mode, positions, Vacancy, and ordered options', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Valmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const added = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Välj styrelse',
			kind: 'selection',
			positionCount: 2,
			vacancyEnabled: false,
			options: ['Ada', 'Bo', 'Cleo']
		});

		expect(added).toMatchObject({
			kind: 'selection',
			selection: {
				mode: 'multiple',
				positionCount: 2,
				vacancyEnabled: false,
				options: [
					{ label: 'Ada', position: 0 },
					{ label: 'Bo', position: 1 },
					{ label: 'Cleo', position: 2 }
				]
			}
		});
	});

	it('edits and reorders draft Votes while retaining their agenda slots', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const first = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Första',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår',
			majorityRule: 'qualified',
			abstentionsCounted: true
		});
		if (!first) throw new Error('Expected the first draft Vote to be created');
		const second = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Andra',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});
		if (!second) throw new Error('Expected the second draft Vote to be created');

		const updated = await editDraftVote({
			organizerUserId,
			voteId: first.id,
			meetingId: created.id,
			title: 'Uppdaterad',
			kind: 'selection',
			positionCount: 1,
			vacancyEnabled: true,
			options: ['Alternativ A', 'Alternativ B']
		});
		await reorderDraftVotes({
			organizerUserId,
			meetingId: created.id,
			orderedVoteIds: [second.id, first.id]
		});

		expect(updated).toMatchObject({ title: 'Uppdaterad', kind: 'selection' });
		expect(await readAgendaForMeeting(db, created.id)).toMatchObject([
			{ id: second.id, position: 0 },
			{ id: first.id, position: 1 }
		]);
	});

	it('removes only draft Votes owned by the Organizer', async () => {
		const organizerUserId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Ta bort',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected the draft Vote to be created');

		expect(
			await removeDraftVote({
				organizerUserId: otherOrganizerId,
				meetingId: created.id,
				voteId: vote.id
			})
		).toBe(false);
		expect(await removeDraftVote({ organizerUserId, meetingId: created.id, voteId: vote.id })).toBe(
			true
		);
		expect(await readAgendaForMeeting(db, created.id)).toEqual([]);
	});

	it('saves a draft Vote by inserting or replacing based on voteId', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const added = await saveDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Ny',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!added) throw new Error('Expected the draft Vote to be created');

		const updated = await saveDraftVote({
			organizerUserId,
			meetingId: created.id,
			voteId: added.id,
			title: 'Ändrad',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});

		expect(updated).toMatchObject({ id: added.id, title: 'Ändrad' });
	});

	it('protects the core configuration of an open Vote', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Pågående',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Låst fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected the draft Vote to be created');
		await sql`
				UPDATE vote
				SET lifecycle = 'open', opened_at = now()
				WHERE id = ${vote.id}
			`;

		expect(
			await editDraftVote({
				organizerUserId,
				voteId: vote.id,
				meetingId: created.id,
				title: 'Försök ändra',
				kind: 'decision',
				supportLabel: 'Ja',
				opposeLabel: 'Nej',
				abstentionLabel: 'Avstår',
				majorityRule: 'qualified',
				abstentionsCounted: true
			})
		).toBeNull();
	});
});
