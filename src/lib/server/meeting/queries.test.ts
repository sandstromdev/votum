import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDraftVote } from '#lib/server/agenda/index.js';
import { submitDecisionBallot } from '#lib/server/ballot/index.js';
import {
	activateVote,
	createDraftMeeting,
	getOrganizerMeetingByLocator,
	getParticipantPageProjection,
	getParticipantProjection,
	getPresentationProjection,
	openMeeting
} from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';

const context = createServerTestContext();
const { sql } = context;

describe('Meeting queries', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('resolves one Meeting by locator only for its Organizer', async () => {
		const organizerUserId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte för detaljsidan',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ id: created.id, publicLocator: created.publicLocator, title: created.title });
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId: otherOrganizerId,
				publicLocator: created.publicLocator
			})
		).toBeNull();
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: 'does-not-exist'
			})
		).toBeNull();
	});

	it('loads agenda rows for owned Meetings without an extra ownership query', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});

		const meeting = await getOrganizerMeetingByLocator({
			organizerUserId,
			publicLocator: created.publicLocator
		});
		expect(meeting?.agenda).toEqual([vote]);
	});

	it('returns the current submitted Ballot count for the Organizer', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med deltagarantal',
			expectedParticipantCount: 12
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected the draft Vote to be created');

		await openMeeting({ organizerUserId, meetingId: created.id });
		await activateVote({ organizerUserId, meetingId: created.id, voteId: vote.id });

		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ activeBallotCount: 0 });

		const participant = await getParticipantPageProjection(created.publicLocator);
		if (participant.state !== 'active') throw new Error('Expected the Vote to be active');
		await submitDecisionBallot({
			publicLocator: created.publicLocator,
			activeVoteKey: participant.activeVoteKey,
			choice: 'support'
		});

		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ activeBallotCount: 1 });
	});

	it('resolves the stable locator to a public projection without Organizer data', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Styrelsemöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const projection = await getParticipantProjection(created.publicLocator);

		expect(projection).toEqual({
			state: 'invalid',
			message: 'Möteslänken kunde inte hittas.'
		});
		expect(await getPresentationProjection('does-not-exist')).toEqual({
			state: 'invalid',
			message: 'Möteslänken kunde inte hittas.'
		});
		expect(projection).not.toHaveProperty('organizerUserId');
		expect(projection).not.toHaveProperty('publicLocator');
	});

	it('returns a generic invalid projection for an unknown locator', async () => {
		expect(await getParticipantProjection('does-not-exist')).toEqual({
			state: 'invalid',
			message: 'Möteslänken kunde inte hittas.'
		});
	});

	it('keeps an explicitly closed Meeting readable as an ended participant state', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Avslutat årsmöte',
			expectedParticipantCount: 18
		});
		context.trackMeetings(created.id);

		await sql`
				UPDATE meeting
				SET lifecycle = 'closed', opened_at = now(), closed_at = now(), presentation_qr_enabled = true,
					revision = revision + 1
				WHERE id = ${created.id}
			`;

		expect(await getParticipantProjection(created.publicLocator)).toEqual({
			state: 'ended',
			meeting: { title: 'Avslutat årsmöte' },
			participation: { current: 0, expected: 18 },
			revision: 1
		});
		expect(await getPresentationProjection(created.publicLocator)).toEqual({
			state: 'ended',
			meeting: { title: 'Avslutat årsmöte' },
			participation: { current: 0, expected: 18 },
			presentationQrEnabled: false,
			revision: 1
		});
		expect(await getParticipantProjection(created.publicLocator)).not.toHaveProperty(
			'organizerUserId'
		);
	});

	it('keeps an idle open Meeting in the waiting state after explicit opening', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Pausat möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		await openMeeting({ organizerUserId, meetingId: created.id });

		expect(await getParticipantProjection(created.publicLocator)).toEqual({
			state: 'waiting',
			meeting: { title: 'Pausat möte' },
			participation: { current: 0, expected: null },
			revision: 1
		});
		expect(await getPresentationProjection(created.publicLocator)).toEqual({
			state: 'waiting',
			meeting: { title: 'Pausat möte' },
			participation: { current: 0, expected: null },
			presentationQrEnabled: false,
			revision: 1
		});
	});

	it('publishes the persisted Presentation QR setting without exposing it to Participants', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med QR-kod',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		await openMeeting({ organizerUserId, meetingId: created.id });
		await sql`
			UPDATE meeting
			SET presentation_qr_enabled = true, revision = revision + 1
			WHERE id = ${created.id}
		`;

		expect(await getPresentationProjection(created.publicLocator)).toMatchObject({
			state: 'waiting',
			presentationQrEnabled: true,
			revision: 2
		});
		expect(await getParticipantProjection(created.publicLocator)).not.toHaveProperty(
			'presentationQrEnabled'
		);
	});

	it('keeps future agenda rows out of the public Meeting projection', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Öppet möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Framtida fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected the draft Vote to be created');
		await openMeeting({ organizerUserId, meetingId: created.id });

		const projection = await getParticipantProjection(created.publicLocator);
		expect(projection).toMatchObject({ state: 'waiting', revision: 2 });
		expect(projection).not.toHaveProperty('vote');
		expect(JSON.stringify(projection)).not.toContain('Framtida fråga');
	});

	it('publishes Selection options without exposing raw Ballots or Participant tokens', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Valmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Välj en ordförande',
			kind: 'selection',
			positionCount: 1,
			vacancyEnabled: true,
			options: ['Ada', 'Bo']
		});
		if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');

		await openMeeting({ organizerUserId, meetingId: created.id });
		await activateVote({ organizerUserId, meetingId: created.id, voteId: vote.id });

		const projection = await getParticipantProjection(created.publicLocator);
		expect(projection).toMatchObject({
			state: 'active',
			vote: {
				kind: 'selection',
				selection: {
					options: vote.selection.options.map(({ id, label }) => ({ id, label }))
				}
			}
		});
		expect(projection).not.toHaveProperty('ballot');
		expect(JSON.stringify(projection)).not.toContain('participantToken');
		expect(JSON.stringify(projection)).not.toContain('selectedOptionIds');
	});

	it('gives Presentation its own public projection without ballot identifiers', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Visningsmöte',
			expectedParticipantCount: 20
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Välj mötesordförande',
			kind: 'selection',
			positionCount: 1,
			vacancyEnabled: true,
			options: ['Ada', 'Bo']
		});
		if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');

		await openMeeting({ organizerUserId, meetingId: created.id });
		await activateVote({ organizerUserId, meetingId: created.id, voteId: vote.id });

		expect(await getPresentationProjection(created.publicLocator)).toEqual({
			state: 'active',
			meeting: { title: 'Visningsmöte' },
			vote: {
				kind: 'selection',
				title: 'Välj mötesordförande',
				selection: {
					mode: 'single',
					positionCount: 1,
					vacancyEnabled: true,
					options: [{ label: 'Ada' }, { label: 'Bo' }]
				}
			},
			participation: { current: 0, expected: 20 },
			presentationQrEnabled: false,
			revision: 3
		});

		const participantProjection = await getParticipantProjection(created.publicLocator);
		expect(participantProjection).toHaveProperty('activeVoteKey');
		expect(JSON.stringify(await getPresentationProjection(created.publicLocator))).not.toContain(
			'activeVoteKey'
		);
		expect(JSON.stringify(await getPresentationProjection(created.publicLocator))).not.toContain(
			'0193'
		);
	});
});
