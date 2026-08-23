import { foreignKey, jsonb, pgEnum, snakeCase, timestamp, uuid } from 'drizzle-orm/pg-core';
import { INCOMPLETE_RESOLUTION_TYPES } from '#lib/vote/outcome.js';
import { meeting } from './meeting';
import { vote } from './vote';

export const incompleteResolutionType = pgEnum(
	'incomplete_resolution_type',
	INCOMPLETE_RESOLUTION_TYPES
);

// Close creates one snapshot per vote. Triggers in the migration reject updates and deletes so
// later lifecycle operations cannot rewrite the recorded result.
export const outcomeSnapshot = snakeCase.table(
	'outcome_snapshot',
	{
		voteId: uuid().primaryKey(),
		meetingId: uuid()
			.notNull()
			.references(() => meeting.id, { onDelete: 'restrict' }),
		document: jsonb().notNull(),
		createdAt: timestamp().defaultNow().notNull()
	},
	(table) => [
		foreignKey({
			name: 'outcome_snapshot_vote_meeting_fk',
			columns: [table.voteId, table.meetingId],
			foreignColumns: [vote.id, vote.meetingId]
		}).onDelete('restrict')
	]
);

export const outcomeResolution = snakeCase.table(
	'outcome_resolution',
	{
		voteId: uuid()
			.primaryKey()
			.references(() => vote.id, { onDelete: 'restrict' }),
		meetingId: uuid()
			.notNull()
			.references(() => meeting.id, { onDelete: 'restrict' }),
		type: incompleteResolutionType().notNull(),
		resolvedAt: timestamp().notNull()
	},
	(table) => [
		foreignKey({
			name: 'outcome_resolution_vote_meeting_fk',
			columns: [table.voteId, table.meetingId],
			foreignColumns: [vote.id, vote.meetingId]
		}).onDelete('restrict')
	]
);
