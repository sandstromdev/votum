import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { sqlState } from './errors.js';
import { db } from './index.js';
import { user } from './schema/auth.js';
import { meeting } from './schema/meeting.js';
import { outcomeSnapshot } from './schema/outcome.js';
import { selectionVoteConfig, vote } from './schema/vote.js';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
type DatabaseWriter = Pick<typeof db, 'insert'>;

async function insertOrganizer(tx: DatabaseWriter) {
	const id = randomUUID();
	await tx.insert(user).values({
		id,
		name: 'Organizer',
		email: `${id}@example.test`,
		emailVerified: true
	});
	return id;
}

async function insertMeeting(
	tx: DatabaseWriter,
	organizerUserId: string,
	overrides: Partial<{
		id: string;
		lifecycle: (typeof meeting.$inferInsert)['lifecycle'];
		openedAt: Date | null;
		closedAt: Date | null;
	}> = {}
) {
	const id = overrides.id ?? randomUUID();
	await tx.insert(meeting).values({
		id,
		organizerUserId,
		publicLocator: randomUUID(),
		title: 'Årsmöte',
		lifecycle: overrides.lifecycle,
		openedAt: overrides.openedAt,
		closedAt: overrides.closedAt
	});
	return id;
}

async function insertVote(tx: DatabaseWriter, meetingId: string) {
	const id = randomUUID();
	await tx.insert(vote).values({
		id,
		meetingId,
		position: 0,
		title: 'Beslut',
		kind: 'decision'
	});
	return id;
}

function expectSqlState(work: Promise<unknown>, code: string) {
	return expect(work).rejects.toSatisfy((error) => sqlState(error) === code);
}

describe('database lifecycle constraints', () => {
	beforeAll(async () => {
		await db.execute(sql`SELECT 1`);
	});

	it('requires Meeting timestamps to match its lifecycle', async () => {
		const cases = [
			{ lifecycle: 'draft' as const, openedAt: new Date(), closedAt: null },
			{ lifecycle: 'open' as const, openedAt: null, closedAt: null },
			{ lifecycle: 'closed' as const, openedAt: new Date(), closedAt: null }
		];

		for (const values of cases) {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					await insertMeeting(tx, organizerUserId, values);
				}),
				CHECK_VIOLATION
			);
		}
	});

	it('requires invalidated and revealed Vote metadata to be complete', async () => {
		await expectSqlState(
			db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const meetingId = await insertMeeting(tx, organizerUserId);
				await tx.insert(vote).values({
					id: randomUUID(),
					meetingId,
					position: 0,
					title: 'Ogiltig omröstning',
					kind: 'decision',
					lifecycle: 'invalidated',
					openedAt: new Date(),
					invalidatedAt: new Date()
				});
			}),
			CHECK_VIOLATION
		);

		await expectSqlState(
			db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const meetingId = await insertMeeting(tx, organizerUserId);
				await tx.insert(vote).values({
					id: randomUUID(),
					meetingId,
					position: 0,
					title: 'Avslutad omröstning',
					kind: 'decision',
					lifecycle: 'closed',
					openedAt: new Date(),
					closedAt: new Date(),
					revealed: true
				});
			}),
			CHECK_VIOLATION
		);
	});

	it('enforces Selection position rules', async () => {
		await expectSqlState(
			db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const meetingId = await insertMeeting(tx, organizerUserId);
				const voteId = await tx
					.insert(vote)
					.values({
						id: randomUUID(),
						meetingId,
						position: 0,
						title: 'Tom omröstning',
						kind: 'selection'
					})
					.returning({ id: vote.id });

				await tx.insert(selectionVoteConfig).values({
					voteId: voteId[0].id,
					mode: 'multiple',
					positionCount: 0,
					vacancyEnabled: true
				});
			}),
			CHECK_VIOLATION
		);

		await expectSqlState(
			db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const meetingId = await insertMeeting(tx, organizerUserId);
				const voteId = await tx
					.insert(vote)
					.values({
						id: randomUUID(),
						meetingId,
						position: 0,
						title: 'För många platser',
						kind: 'selection'
					})
					.returning({ id: vote.id });

				await tx.insert(selectionVoteConfig).values({
					voteId: voteId[0].id,
					mode: 'single',
					positionCount: 2,
					vacancyEnabled: true
				});
			}),
			CHECK_VIOLATION
		);
	});

	it('keeps Outcome snapshots attached to the same Meeting as their Vote', async () => {
		await expectSqlState(
			db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const sourceMeetingId = await insertMeeting(tx, organizerUserId);
				const targetMeetingId = await insertMeeting(tx, organizerUserId);
				const voteId = await insertVote(tx, sourceMeetingId);

				await tx.insert(outcomeSnapshot).values({
					voteId,
					meetingId: targetMeetingId,
					document: { ballotCount: 1 }
				});
			}),
			FOREIGN_KEY_VIOLATION
		);
	});
});
