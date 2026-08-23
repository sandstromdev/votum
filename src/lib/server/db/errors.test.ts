import { db } from '#lib/server/db/index.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { createDraftMeeting } from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';
import { DrizzleQueryError } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { driverMessage, isUniqueViolation, sqlState } from './errors.js';

const context = createServerTestContext();

function wrapDriverError(cause: Error) {
	return new DrizzleQueryError('insert into meeting', [], cause);
}

function driverError(message: string, code: string) {
	return Object.assign(new Error(message), { code });
}

describe('Database unique violations', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('treats a Drizzle unique locator conflict as a unique violation', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		await expect(
			db.insert(meeting).values({
				organizerUserId,
				publicLocator: created.publicLocator,
				title: 'Extra möte',
				expectedParticipantCount: null
			})
		).rejects.toSatisfy(isUniqueViolation);
	});
});

describe('sqlState', () => {
	it('reads SQLSTATE from a Drizzle-wrapped driver error', () => {
		const error = wrapDriverError(driverError('duplicate key value', '23505'));
		expect(sqlState(error)).toBe('23505');
		expect(isUniqueViolation(error)).toBe(true);
	});

	it('does not treat errors without a driver code as unique violations', () => {
		expect(sqlState(new Error('test'))).toBeNull();
		expect(isUniqueViolation(new Error('test'))).toBe(false);
	});

	it('disregards non-driver errors', () => {
		expect(sqlState('test')).toBeNull();
	});
});

describe('driverMessage', () => {
	it('reads the message from a Drizzle-wrapped driver error', () => {
		const error = wrapDriverError(new Error('duplicate key value violates unique constraint'));
		expect(driverMessage(error)).toBe('duplicate key value violates unique constraint');
	});

	it('returns message from other errors', () => {
		expect(driverMessage(new Error('test'))).toBe('test');
		expect(driverMessage('test')).toBe('test');
	});
});
