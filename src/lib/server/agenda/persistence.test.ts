import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.js';
import { createDraftMeeting } from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';
import { readAgendaForMeeting } from './persistence.js';

const context = createServerTestContext();
const { sql } = context;

describe('Agenda persistence', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('returns an empty agenda for a Meeting with no Votes', async () => {
		expect(await readAgendaForMeeting(db, uuidv7())).toEqual([]);
	});

	it('rejects a Decision Vote that has lost its configuration', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Ofullständig agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const voteId = uuidv7();
		await sql`
			INSERT INTO vote (id, meeting_id, position, title, kind)
			VALUES (${voteId}, ${created.id}, 0, 'Saknad konfiguration', 'decision')
		`;

		await expect(readAgendaForMeeting(db, created.id)).rejects.toThrow(
			'Decision Vote is missing configuration.'
		);
	});
});
