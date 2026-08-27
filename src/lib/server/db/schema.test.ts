import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';
import { sqlState, driverMessage } from '#lib/server/db/errors.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/auth.js';
import { meeting } from '#lib/server/db/schema/meeting.js';
import { outcomeSnapshot } from '#lib/server/db/schema/outcome.js';
import { ballot, participantToken } from '#lib/server/db/schema/participation.js';
import {
	decisionVoteConfig,
	selectionOption,
	selectionVoteConfig,
	vote
} from '#lib/server/db/schema/vote.js';
import { SELECTION_VOTE_MODES, VOTE_KINDS, VOTE_LIFECYCLES } from '#lib/vote/agenda.js';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const INVALID_TEXT_REPRESENTATION = '22P02';

type Db = Pick<typeof db, 'insert' | 'update' | 'delete' | 'execute'>;

async function insertOrganizer(tx: Db) {
	const id = randomUUID();

	await tx.insert(user).values({
		id,
		name: 'Organizer',
		email: `${id}@example.test`,
		emailVerified: false
	});

	return id;
}

async function insertMeeting(
	tx: Db,
	organizerUserId: string,
	overrides: {
		id?: string;
		publicLocator?: string;
		lifecycle?: (typeof meeting.$inferInsert)['lifecycle'];
		openedAt?: Date | null;
		closedAt?: Date | null;
		revision?: number;
		expectedParticipantCount?: number | null;
	} = {}
) {
	const id = overrides.id ?? uuidv7();
	const lifecycle = overrides.lifecycle ?? 'draft';
	let openedAt: Date | null;

	if (overrides.openedAt !== undefined) {
		openedAt = overrides.openedAt;
	} else if (lifecycle === 'draft') {
		openedAt = null;
	} else {
		openedAt = new Date();
	}
	const closedAt = overrides.closedAt === undefined ? null : overrides.closedAt;

	await tx.insert(meeting).values({
		id,
		organizerUserId,
		publicLocator: overrides.publicLocator ?? randomUUID(),
		title: 'Årsmöte',
		lifecycle,
		openedAt,
		closedAt,
		revision: overrides.revision,
		expectedParticipantCount: overrides.expectedParticipantCount
	});

	return id;
}

async function insertVote(
	tx: Db,
	meetingId: string,
	overrides: {
		id?: string;
		position?: number;
		kind?: (typeof vote.$inferInsert)['kind'];
		lifecycle?: (typeof vote.$inferInsert)['lifecycle'];
		openedAt?: Date | null;
		closedAt?: Date | null;
		rerunOfVoteId?: string | null;
		title?: string;
		revealed?: boolean;
	} = {}
) {
	const id = overrides.id ?? uuidv7();

	await tx.insert(vote).values({
		id,
		meetingId,
		position: overrides.position ?? 0,
		title: overrides.title ?? 'Proposition',
		kind: overrides.kind ?? 'decision',
		lifecycle: overrides.lifecycle ?? 'draft',
		openedAt: overrides.openedAt,
		closedAt: overrides.closedAt,
		rerunOfVoteId: overrides.rerunOfVoteId,
		revealed: overrides.revealed
	});

	return id;
}

async function expectSqlState(work: Promise<unknown>, code: string) {
	return expect(work).rejects.toSatisfy((error) => sqlState(error) === code);
}

describe('whole Meeting voting PostgreSQL model', () => {
	beforeAll(async () => {
		await db.execute(sql`SELECT 1`);
	});

	describe('shape', () => {
		it('creates the aggregate tables alongside Better Auth persistence', async () => {
			const tables = await db.execute<{ table_name: string }>(sql`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'public'
					AND table_name IN (
						'user', 'session', 'account', 'verification',
						'meeting', 'vote', 'decision_vote_config', 'selection_vote_config',
						'selection_option', 'participant_token', 'ballot', 'participant_token_anomaly',
						'outcome_snapshot'
					)
			`);

			expect([...tables].map((row) => row.table_name).toSorted()).toEqual([
				'account',
				'ballot',
				'decision_vote_config',
				'meeting',
				'outcome_snapshot',
				'participant_token',
				'participant_token_anomaly',
				'selection_option',
				'selection_vote_config',
				'session',
				'user',
				'verification',
				'vote'
			]);
		});

		it('defines finite Vote values as PostgreSQL enums', async () => {
			const rows = await db.execute<{ type_name: string; values: string[] }>(sql`
				SELECT t.typname AS type_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
				FROM pg_type t
				JOIN pg_enum e ON e.enumtypid = t.oid
				WHERE t.typname IN ('vote_kind', 'vote_lifecycle', 'selection_vote_mode')
				GROUP BY t.typname
				ORDER BY t.typname
			`);

			expect([...rows]).toEqual([
				{ type_name: 'selection_vote_mode', values: [...SELECTION_VOTE_MODES] },
				{ type_name: 'vote_kind', values: [...VOTE_KINDS] },
				{ type_name: 'vote_lifecycle', values: [...VOTE_LIFECYCLES] }
			]);
		});

		it('rejects values outside the finite Vote enums', async () => {
			await expectSqlState(db.execute(sql`SELECT 'other'::vote_kind`), INVALID_TEXT_REPRESENTATION);
			await expectSqlState(
				db.execute(sql`SELECT 'other'::vote_lifecycle`),
				INVALID_TEXT_REPRESENTATION
			);
			await expectSqlState(
				db.execute(sql`SELECT 'other'::selection_vote_mode`),
				INVALID_TEXT_REPRESENTATION
			);
		});
	});

	describe('Meeting', () => {
		it('assigns a UUIDv7 when a Meeting is inserted without an id', async () => {
			await db.transaction(async (tx) => {
				const organizerUserId = await insertOrganizer(tx);
				const [row] = await tx
					.insert(meeting)
					.values({
						organizerUserId,
						publicLocator: randomUUID(),
						title: 'Årsmöte'
					})
					.returning({ id: meeting.id });

				expect(row.id).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
				);

				await tx.delete(meeting).where(eq(meeting.id, row.id));
				await tx.delete(user).where(eq(user.id, organizerUserId));
			});
		});

		it('rejects a second Meeting with the same public locator', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);

					await insertMeeting(tx, organizerUserId, { publicLocator: 'same-link' });
					await insertMeeting(tx, organizerUserId, { publicLocator: 'same-link' });
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects a Meeting that is not organized by a persisted user', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					await insertMeeting(tx, randomUUID());
				}),
				FOREIGN_KEY_VIOLATION
			);
		});

		it('rejects a negative Meeting revision and a non-positive expected participant count', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);

					await insertMeeting(tx, organizerUserId, { revision: -1 });
				}),
				CHECK_VIOLATION
			);

			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);

					await insertMeeting(tx, organizerUserId, { expectedParticipantCount: 0 });
				}),
				CHECK_VIOLATION
			);
		});
	});

	describe('Vote', () => {
		it('rejects a second Vote at the same position in a Meeting', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);

					await insertVote(tx, meetingId, { position: 0 });
					await insertVote(tx, meetingId, { position: 0 });
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects a second open Vote in the same Meeting', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const openedAt = new Date();

					await insertVote(tx, meetingId, { position: 0, lifecycle: 'open', openedAt });
					await insertVote(tx, meetingId, { position: 1, lifecycle: 'open', openedAt });
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects revealing a Vote that is not closed', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);

					await insertVote(tx, meetingId, {
						lifecycle: 'open',
						openedAt: new Date(),
						revealed: true
					});
				}),
				CHECK_VIOLATION
			);
		});

		it('rejects a Vote that reruns itself', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = uuidv7();

					await insertVote(tx, meetingId, { id: voteId, rerunOfVoteId: voteId });
				}),
				CHECK_VIOLATION
			);
		});

		it('rejects a Rerun that points at a Vote from another Meeting', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const sourceMeetingId = await insertMeeting(tx, organizerUserId);
					const targetMeetingId = await insertMeeting(tx, organizerUserId);
					const sourceVoteId = await insertVote(tx, sourceMeetingId);

					await insertVote(tx, targetMeetingId, { rerunOfVoteId: sourceVoteId });
				}),
				FOREIGN_KEY_VIOLATION
			);
		});

		describe('Decision', () => {
			it('defaults legacy-style Decision configuration to Simple majority without changing labels', async () => {
				await db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId, {
						kind: 'decision',
						lifecycle: 'open',
						openedAt: new Date('2026-08-20T10:00:00.000Z')
					});

					await tx.insert(decisionVoteConfig).values({
						voteId,
						supportLabel: 'Ja',
						opposeLabel: 'Nej',
						abstentionLabel: 'Avstår'
					});

					const [config] = await tx
						.select()
						.from(decisionVoteConfig)
						.where(eq(decisionVoteConfig.voteId, voteId));

					expect(config).toMatchObject({
						supportLabel: 'Ja',
						opposeLabel: 'Nej',
						abstentionLabel: 'Avstår',
						majorityRule: 'simple',
						abstentionsCounted: false
					});
					const [voteRow] = await tx
						.select({ lifecycle: vote.lifecycle, title: vote.title })
						.from(vote)
						.where(eq(vote.id, voteId));

					expect(voteRow).toEqual({ lifecycle: 'open', title: 'Proposition' });

					await tx.delete(decisionVoteConfig).where(eq(decisionVoteConfig.voteId, voteId));
					await tx.delete(vote).where(eq(vote.id, voteId));
					await tx.delete(meeting).where(eq(meeting.id, meetingId));
					await tx.delete(user).where(eq(user.id, organizerUserId));
				});
			});

			it('rejects a second Decision configuration for the same Vote', async () => {
				await expectSqlState(
					db.transaction(async (tx) => {
						const organizerUserId = await insertOrganizer(tx);
						const meetingId = await insertMeeting(tx, organizerUserId);
						const voteId = await insertVote(tx, meetingId, { kind: 'decision' });

						await tx.insert(decisionVoteConfig).values({
							voteId,
							supportLabel: 'Ja',
							opposeLabel: 'Nej',
							abstentionLabel: 'Avstår'
						});
						await tx.insert(decisionVoteConfig).values({
							voteId,
							supportLabel: 'För',
							opposeLabel: 'Emot',
							abstentionLabel: 'Avstår'
						});
					}),
					UNIQUE_VIOLATION
				);
			});
		});

		describe('Selection', () => {
			it('rejects Selection options that share a position in the same Vote', async () => {
				await expectSqlState(
					db.transaction(async (tx) => {
						const organizerUserId = await insertOrganizer(tx);
						const meetingId = await insertMeeting(tx, organizerUserId);
						const voteId = await insertVote(tx, meetingId, { kind: 'selection' });

						await tx.insert(selectionVoteConfig).values({
							voteId,
							mode: 'single',
							positionCount: 1,
							vacancyEnabled: true
						});
						await tx.insert(selectionOption).values({
							id: uuidv7(),
							voteId,
							label: 'Ada',
							position: 0
						});
						await tx.insert(selectionOption).values({
							id: uuidv7(),
							voteId,
							label: 'Bo',
							position: 0
						});
					}),
					UNIQUE_VIOLATION
				);
			});
		});
	});

	describe('Ballot', () => {
		it('enforces one initial submission key per Meeting', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId);
					const initialSubmissionKeyHash = randomUUID();

					await tx.insert(participantToken).values({
						id: uuidv7(),
						meetingId,
						tokenHash: randomUUID(),
						initialSubmissionKeyHash,
						initialSubmissionVoteId: voteId,
						initialSubmissionPayloadHash: randomUUID(),
						initialSubmissionTokenCiphertext: 'encrypted-token'
					});
					await tx.insert(participantToken).values({
						id: uuidv7(),
						meetingId,
						tokenHash: randomUUID(),
						initialSubmissionKeyHash,
						initialSubmissionVoteId: voteId,
						initialSubmissionPayloadHash: randomUUID(),
						initialSubmissionTokenCiphertext: 'encrypted-token'
					});
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects a second current Ballot for the same Participant token and Vote', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId);
					const tokenId = uuidv7();

					await tx.insert(participantToken).values({
						id: tokenId,
						meetingId,
						tokenHash: randomUUID()
					});
					await tx.insert(ballot).values({
						id: uuidv7(),
						meetingId,
						voteId,
						participantTokenId: tokenId,
						payload: { type: 'decision', choice: 'support' }
					});
					await tx.insert(ballot).values({
						id: uuidv7(),
						meetingId,
						voteId,
						participantTokenId: tokenId,
						payload: { type: 'decision', choice: 'oppose' }
					});
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects a Ballot that combines a Vote and Participant token from different Meetings', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const otherMeetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId);
					const tokenId = uuidv7();

					await tx.insert(participantToken).values({
						id: tokenId,
						meetingId: otherMeetingId,
						tokenHash: randomUUID()
					});
					await tx.insert(ballot).values({
						id: uuidv7(),
						meetingId,
						voteId,
						participantTokenId: tokenId,
						payload: { type: 'decision', choice: 'support' }
					});
				}),
				FOREIGN_KEY_VIOLATION
			);
		});
	});

	describe('Outcome', () => {
		it('rejects a second Outcome snapshot for the same Vote', async () => {
			await expectSqlState(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId, {
						lifecycle: 'closed',
						openedAt: new Date('2026-01-01T10:00:00Z'),
						closedAt: new Date('2026-01-01T10:05:00Z')
					});

					await tx.insert(outcomeSnapshot).values({
						voteId,
						meetingId,
						document: { ballotCount: 1 }
					});
					await tx.insert(outcomeSnapshot).values({
						voteId,
						meetingId,
						document: { ballotCount: 2 }
					});
				}),
				UNIQUE_VIOLATION
			);
		});

		it('rejects updates and deletes of an Outcome snapshot', async () => {
			await expect(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId, {
						lifecycle: 'closed',
						openedAt: new Date('2026-01-01T10:00:00Z'),
						closedAt: new Date('2026-01-01T10:05:00Z')
					});

					await tx.insert(outcomeSnapshot).values({
						voteId,
						meetingId,
						document: { ballotCount: 1 }
					});
					await tx
						.update(outcomeSnapshot)
						.set({ document: { ballotCount: 99 } })
						.where(eq(outcomeSnapshot.voteId, voteId));
				})
			).rejects.toSatisfy((error) =>
				driverMessage(error).includes('outcome snapshots are immutable')
			);

			await expect(
				db.transaction(async (tx) => {
					const organizerUserId = await insertOrganizer(tx);
					const meetingId = await insertMeeting(tx, organizerUserId);
					const voteId = await insertVote(tx, meetingId, {
						lifecycle: 'closed',
						openedAt: new Date('2026-01-01T10:00:00Z'),
						closedAt: new Date('2026-01-01T10:05:00Z')
					});

					await tx.insert(outcomeSnapshot).values({
						voteId,
						meetingId,
						document: { ballotCount: 1 }
					});
					await tx.delete(outcomeSnapshot).where(eq(outcomeSnapshot.voteId, voteId));
				})
			).rejects.toSatisfy((error) =>
				driverMessage(error).includes('outcome snapshots are immutable')
			);
		});
	});
});
