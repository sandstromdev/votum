import { sql } from 'drizzle-orm';
import {
	foreignKey,
	jsonb,
	snakeCase,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { meeting } from './meeting';
import { vote } from './vote';
import type { StoredBallotPayload } from '#lib/server/ballot/payload.js';

export type ParticipantTokenAnomalyPayload = {
	operation: 'read' | 'submit' | 'withdraw';
	tokenState: 'unrecognized' | 'wrong_meeting';
};

export const participantToken = snakeCase.table(
	'participant_token',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		meetingId: uuid()
			.notNull()
			.references(() => meeting.id, { onDelete: 'restrict' }),
		tokenHash: text().notNull(),
		initialSubmissionKeyHash: text(),
		initialSubmissionVoteId: uuid().references(() => vote.id, { onDelete: 'restrict' }),
		initialSubmissionPayloadHash: text(),
		initialSubmissionTokenCiphertext: text(),
		createdAt: timestamp().defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('participant_token_hash_uidx').on(table.tokenHash),
		uniqueIndex('participant_token_meeting_initial_submission_key_uidx')
			.on(table.meetingId, table.initialSubmissionKeyHash)
			.where(sql`${table.initialSubmissionKeyHash} IS NOT NULL`),
		// Lets a ballot reference this token only within the same meeting.
		uniqueIndex('participant_token_id_meeting_id_uidx').on(table.id, table.meetingId)
	]
);

export const ballot = snakeCase.table(
	'ballot',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		meetingId: uuid()
			.notNull()
			.references(() => meeting.id, { onDelete: 'restrict' }),
		voteId: uuid().notNull(),
		participantTokenId: uuid().notNull(),
		payload: jsonb().$type<StoredBallotPayload>().notNull(),
		createdAt: timestamp().defaultNow().notNull(),
		updatedAt: timestamp().defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('ballot_vote_participant_token_uidx').on(table.voteId, table.participantTokenId),
		foreignKey({
			name: 'ballot_vote_meeting_fk',
			columns: [table.voteId, table.meetingId],
			foreignColumns: [vote.id, vote.meetingId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'ballot_participant_token_meeting_fk',
			columns: [table.participantTokenId, table.meetingId],
			foreignColumns: [participantToken.id, participantToken.meetingId]
		}).onDelete('restrict')
	]
);

export const participantTokenAnomaly = snakeCase.table(
	'participant_token_anomaly',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		name: text().notNull(),
		meetingId: uuid().references(() => meeting.id, { onDelete: 'set null' }),
		voteId: uuid().references(() => vote.id, { onDelete: 'set null' }),
		payload: jsonb().$type<ParticipantTokenAnomalyPayload>().notNull(),
		createdAt: timestamp().defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('participant_token_anomaly_meeting_vote_name_uidx').on(
			table.meetingId,
			table.voteId,
			table.name
		)
	]
);
