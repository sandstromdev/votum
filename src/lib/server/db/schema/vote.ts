import {
	boolean,
	check,
	foreignKey,
	integer,
	pgEnum,
	snakeCase,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { SELECTION_VOTE_MODES, VOTE_KINDS, VOTE_LIFECYCLES } from '#lib/vote/agenda.js';
import { MAJORITY_RULES } from '#lib/vote/majority.js';
import { user } from './auth';
import { meeting } from './meeting';

export const voteKind = pgEnum('vote_kind', VOTE_KINDS);
export const voteLifecycle = pgEnum('vote_lifecycle', VOTE_LIFECYCLES);
export const selectionVoteMode = pgEnum('selection_vote_mode', SELECTION_VOTE_MODES);
export const majorityRule = pgEnum('majority_rule', MAJORITY_RULES);

export const vote = snakeCase.table(
	'vote',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		meetingId: uuid()
			.notNull()
			.references(() => meeting.id, { onDelete: 'restrict' }),
		position: integer().notNull(),
		title: text().notNull(),
		kind: voteKind().notNull(),
		lifecycle: voteLifecycle().notNull().default('draft'),
		rerunOfVoteId: uuid(),
		openedAt: timestamp(),
		closedAt: timestamp(),
		revealed: boolean().notNull().default(false),
		revealedAt: timestamp(),
		publicResultBreakdownEnabled: boolean().notNull().default(false),
		invalidationReason: text(),
		invalidatedByUserId: text().references(() => user.id, { onDelete: 'restrict' }),
		invalidatedAt: timestamp(),
		createdAt: timestamp().defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('vote_meeting_position_uidx').on(table.meetingId, table.position),
		// Lets ballots and snapshots reference this vote only within the same meeting.
		unique('vote_id_meeting_id_uidx').on(table.id, table.meetingId),
		uniqueIndex('vote_one_open_per_meeting_uidx')
			.on(table.meetingId)
			.where(sql`${table.lifecycle} = 'open'`),
		foreignKey({
			name: 'vote_rerun_of_vote_meeting_fk',
			columns: [table.rerunOfVoteId, table.meetingId],
			foreignColumns: [table.id, table.meetingId]
		}).onDelete('restrict'),
		check('vote_position_nonnegative_chk', sql`${table.position} >= 0`),
		check('vote_title_present_chk', sql`char_length(${table.title}) > 0`),
		check(
			'vote_no_self_rerun_chk',
			sql`${table.rerunOfVoteId} IS NULL OR ${table.rerunOfVoteId} <> ${table.id}`
		),
		check(
			'vote_lifecycle_chk',
			sql`(
				(
					${table.lifecycle} = 'draft'
					AND ${table.openedAt} IS NULL
					AND ${table.closedAt} IS NULL
					AND ${table.invalidatedAt} IS NULL
					AND ${table.revealed} = false
					AND ${table.revealedAt} IS NULL
				)
				OR (
					${table.lifecycle} = 'open'
					AND ${table.openedAt} IS NOT NULL
					AND ${table.closedAt} IS NULL
					AND ${table.invalidatedAt} IS NULL
					AND ${table.revealed} = false
					AND ${table.revealedAt} IS NULL
				)
				OR (
					${table.lifecycle} = 'closed'
					AND ${table.openedAt} IS NOT NULL
					AND ${table.closedAt} IS NOT NULL
					AND ${table.invalidatedAt} IS NULL
					AND (
						(${table.revealed} = false AND ${table.revealedAt} IS NULL)
						OR (${table.revealed} = true AND ${table.revealedAt} IS NOT NULL)
					)
				)
				OR (
					${table.lifecycle} = 'invalidated'
					AND ${table.openedAt} IS NOT NULL
					AND ${table.invalidatedAt} IS NOT NULL
					AND ${table.revealed} = false
					AND ${table.revealedAt} IS NULL
					AND ${table.invalidationReason} IS NOT NULL
					AND ${table.invalidatedByUserId} IS NOT NULL
				)
			)`
		)
	]
);

export const decisionVoteConfig = snakeCase.table(
	'decision_vote_config',
	{
		voteId: uuid()
			.primaryKey()
			.references(() => vote.id, { onDelete: 'cascade' }),
		supportLabel: text().notNull(),
		opposeLabel: text().notNull(),
		abstentionLabel: text().notNull(),
		majorityRule: majorityRule().notNull().default('simple'),
		abstentionsCounted: boolean().notNull().default(false)
	},
	(table) => [
		check('decision_support_label_present_chk', sql`char_length(${table.supportLabel}) > 0`),
		check('decision_oppose_label_present_chk', sql`char_length(${table.opposeLabel}) > 0`),
		check('decision_abstention_label_present_chk', sql`char_length(${table.abstentionLabel}) > 0`),
		check(
			'decision_abstentions_only_qualified_chk',
			sql`${table.majorityRule} = 'qualified' OR ${table.abstentionsCounted} = false`
		)
	]
);

export const selectionVoteConfig = snakeCase.table(
	'selection_vote_config',
	{
		voteId: uuid()
			.primaryKey()
			.references(() => vote.id, { onDelete: 'cascade' }),
		mode: selectionVoteMode().notNull(),
		positionCount: integer().notNull(),
		vacancyEnabled: boolean().notNull().default(true)
	},
	(table) => [
		check('selection_position_count_positive_chk', sql`${table.positionCount} > 0`),
		check(
			'selection_single_winner_one_position_chk',
			sql`${table.mode} <> 'single' OR ${table.positionCount} = 1`
		)
	]
);

export const selectionOption = snakeCase.table(
	'selection_option',
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		voteId: uuid()
			.notNull()
			.references(() => vote.id, { onDelete: 'cascade' }),
		label: text().notNull(),
		position: integer().notNull()
	},
	(table) => [
		uniqueIndex('selection_option_vote_position_uidx').on(table.voteId, table.position),
		check('selection_option_position_nonnegative_chk', sql`${table.position} >= 0`),
		check('selection_option_label_present_chk', sql`char_length(${table.label}) > 0`)
	]
);
