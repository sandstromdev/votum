/// <reference types="node" />

import { addDraftVote } from '#lib/server/agenda/commands.js';
import { db, client } from '#lib/server/db/index.js';
import { createDraftMeeting } from '#lib/server/meeting/commands.js';
import { draftVoteSchema, type DraftVoteInput } from '#lib/schemas/vote.js';
import { organizerVoteToDraftFields } from '#lib/vote/configuration.js';
import type { MajorityRule } from '#lib/vote/majority.js';

if (process.env.NODE_ENV !== 'development') {
	console.error('Seed script can only be run in development mode.');
	process.exit(1);
}

const meetingTitle = process.env.SEED_MEETING_TITLE ?? 'Demomöte';

type SeedVoteDefinition =
	| {
			title: string;
			kind: 'decision';
			majorityRule?: MajorityRule;
			abstentionsCounted?: boolean;
	  }
	| { title: string; kind: 'selection'; positionCount: number; vacancyEnabled: boolean };

const voteDefinitions = [
	{ title: 'Beslut', kind: 'decision' },
	{ title: 'Beslut med kvalificerad majoritet', kind: 'decision', majorityRule: 'qualified' },
	{
		title: 'Beslut med 2/3, avståenden räknas',
		kind: 'decision',
		majorityRule: 'qualified',
		abstentionsCounted: true
	},
	{ title: 'Enkelval med vakans', kind: 'selection', positionCount: 1, vacancyEnabled: true },
	{ title: 'Enkelval utan vakans', kind: 'selection', positionCount: 1, vacancyEnabled: false },
	{ title: 'Flerval med vakans', kind: 'selection', positionCount: 2, vacancyEnabled: true },
	{ title: 'Flerval utan vakans', kind: 'selection', positionCount: 2, vacancyEnabled: false }
] satisfies readonly SeedVoteDefinition[];

type InsertedIds = {
	meetingId?: string;
	voteIds: string[];
};

async function resolveOrganizerUserId() {
	const requestedUserId = process.env.SEED_ORGANIZER_USER_ID;
	const requestedEmail = process.env.SEED_ORGANIZER_EMAIL;

	if (!requestedUserId && !requestedEmail) {
		throw new Error('Set SEED_ORGANIZER_USER_ID or SEED_ORGANIZER_EMAIL to an existing user.');
	}

	const organizer = await db.query.user.findFirst({
		where: {
			OR: [{ id: requestedUserId }, { email: requestedEmail }]
		}
	});

	if (!organizer) {
		const identifier = requestedUserId ? `user id ${requestedUserId}` : `email ${requestedEmail}`;

		throw new Error(`Could not find an existing organizer with ${identifier}.`);
	}

	return organizer.id;
}

function toDraftVoteInput(meetingId: string, definition: SeedVoteDefinition): DraftVoteInput {
	const defaults = organizerVoteToDraftFields();
	const input =
		definition.kind === 'decision'
			? {
					...defaults,
					meetingId,
					title: definition.title,
					kind: 'decision' as const,
					majorityRule: definition.majorityRule ?? defaults.majorityRule,
					abstentionsCounted: definition.abstentionsCounted ?? defaults.abstentionsCounted
				}
			: {
					...defaults,
					meetingId,
					title: definition.title,
					kind: 'selection' as const,
					positionCount: definition.positionCount,
					vacancyEnabled: definition.vacancyEnabled,
					options: ['Ada', 'Bo', 'Carl', 'David']
				};

	return draftVoteSchema.parse(input);
}

const inserted: InsertedIds = { voteIds: [] };

try {
	const organizerUserId = await resolveOrganizerUserId();
	const createdMeeting = await createDraftMeeting({
		organizerUserId,
		title: meetingTitle,
		expectedParticipantCount: null
	});

	inserted.meetingId = createdMeeting.id;

	for (const definition of voteDefinitions) {
		const createdVote = await addDraftVote({
			organizerUserId,
			...toDraftVoteInput(createdMeeting.id, definition)
		});

		if (!createdVote) {
			throw new Error(`Could not add Vote ${definition.title}.`);
		}
		inserted.voteIds.push(createdVote.id);
	}

	console.log(
		`Seeded Meeting ${createdMeeting.id} (${createdMeeting.publicLocator}) with ${inserted.voteIds.length} Votes. Participant link: ${createdMeeting.participantPath}`
	);
} catch (error) {
	console.error('Seed failed after these rows were inserted:', JSON.stringify(inserted));

	throw error;
} finally {
	await client.end();
}
