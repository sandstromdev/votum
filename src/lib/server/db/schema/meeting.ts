import {
	check,
	boolean,
	integer,
	pgEnum,
	snakeCase,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { MEETING_LIFECYCLES } from '#lib/vote/meeting.js';
import { user } from './auth';

export const meetingLifecycle = pgEnum('meeting_lifecycle', MEETING_LIFECYCLES);

export const meeting = snakeCase.table(
	'meeting',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		organizerUserId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		publicLocator: text().notNull(),
		title: text().notNull(),
		lifecycle: meetingLifecycle().notNull().default('draft'),
		expectedParticipantCount: integer(),
		presentationQrEnabled: boolean().notNull().default(false),
		// Incremented in the same transaction as each public meeting or vote state change.
		revision: integer().notNull().default(0),
		createdAt: timestamp().defaultNow().notNull(),
		openedAt: timestamp(),
		closedAt: timestamp()
	},
	(table) => [
		uniqueIndex('meeting_public_locator_uidx').on(table.publicLocator),
		check(
			'meeting_lifecycle_chk',
			sql`(
				(${table.lifecycle} = 'draft' AND ${table.openedAt} IS NULL AND ${table.closedAt} IS NULL)
				OR (${table.lifecycle} = 'open' AND ${table.openedAt} IS NOT NULL AND ${table.closedAt} IS NULL)
				OR (${table.lifecycle} = 'closed' AND ${table.openedAt} IS NOT NULL AND ${table.closedAt} IS NOT NULL)
			)`
		),
		check('meeting_revision_nonnegative_chk', sql`${table.revision} >= 0`),
		check(
			'meeting_expected_participant_count_chk',
			sql`${table.expectedParticipantCount} IS NULL OR ${table.expectedParticipantCount} > 0`
		),
		check('meeting_public_locator_present_chk', sql`char_length(${table.publicLocator}) > 0`),
		check('meeting_title_present_chk', sql`char_length(${table.title}) > 0`)
	]
);
