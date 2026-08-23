import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDraftVote } from '#lib/server/agenda/index.js';
import {
	activateNextVote,
	activateVote,
	closeVote,
	createDraftMeeting,
	deleteMeeting,
	endMeeting,
	getOrganizerMeetingByLocator,
	getParticipantProjection,
	listOrganizerMeetings,
	openMeeting,
	updateMeetingSettings
} from '#lib/server/meeting/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';

const context = createServerTestContext();
const { sql } = context;

describe('Meeting commands', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
	});

	afterAll(async () => {
		await context.close();
	});

	it('creates one unopened Meeting with stable public paths', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 42
		});
		context.trackMeetings(created.id);

		expect(created).toMatchObject({
			title: 'Årsmöte',
			lifecycle: 'draft',
			expectedParticipantCount: 42,
			presentationQrEnabled: false,
			revision: 0,
			participantPath: `/m/${created.publicLocator}`,
			presentationPath: `/p/${created.publicLocator}`
		});
		expect(created.publicLocator).toMatch(/^[0-9a-hj-km-np-tv-z]{8}$/);
		expect(created.publicLocator).not.toMatch(/[ilu]/);

		const meetings = await listOrganizerMeetings(organizerUserId);
		expect(meetings).toHaveLength(1);
		expect(meetings[0]).toMatchObject({ id: created.id, title: 'Årsmöte' });

		const second = await createDraftMeeting({
			organizerUserId,
			title: 'Extra möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(second.id);
		expect(second.publicLocator).not.toBe(created.publicLocator);
	});

	it('opens a draft Meeting explicitly', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Förberedd fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});

		const opened = await openMeeting({ organizerUserId, meetingId: created.id });

		expect(opened).toMatchObject({ id: created.id, lifecycle: 'open', revision: 2 });
		expect(opened?.agenda).toMatchObject([{ title: 'Förberedd fråga', kind: 'decision' }]);
		expect(await getParticipantProjection(created.publicLocator)).toMatchObject({
			state: 'waiting',
			revision: 2
		});
	});

	it('does not open a Meeting for another Organizer', async () => {
		const organizerUserId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Privat möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		expect(
			await openMeeting({ organizerUserId: otherOrganizerId, meetingId: created.id })
		).toBeNull();
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ id: created.id, lifecycle: 'draft', revision: 0 });
	});

	it('does not open a Meeting that is already open', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Redan öppet',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		expect(await openMeeting({ organizerUserId, meetingId: created.id })).toMatchObject({
			lifecycle: 'open',
			revision: 1
		});

		expect(await openMeeting({ organizerUserId, meetingId: created.id })).toBeNull();
		expect(await context.getMeetingRevision(created.id)).toBe(1);
	});

	it('explicitly activates one configured Vote and exposes only its public presentation', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(created.id);
		const first = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Första frågan',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Framtida fråga',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});
		if (!first) throw new Error('Expected the first draft Vote to be created');

		await openMeeting({ organizerUserId, meetingId: created.id });
		const activated = await activateVote({
			organizerUserId,
			meetingId: created.id,
			voteId: first.id
		});

		expect(activated).toMatchObject({
			id: created.id,
			revision: 4
		});
		expect(activated?.agenda.find(({ id }) => id === first.id)).toMatchObject({
			lifecycle: 'open'
		});
		expect(await getParticipantProjection(created.publicLocator)).toEqual({
			state: 'active',
			meeting: { title: 'Årsmöte' },
			activeVoteKey: expect.any(String),
			vote: {
				title: 'Första frågan',
				kind: 'decision',
				decision: {
					supportLabel: 'För',
					opposeLabel: 'Emot',
					abstentionLabel: 'Avstår',
					majorityLabel: 'Fler röster för än emot. Avståenden räknas inte.'
				}
			},
			participation: { current: 0, expected: 12 },
			revision: 4
		});
		expect(JSON.stringify(await getParticipantProjection(created.publicLocator))).not.toContain(
			'Framtida fråga'
		);
	});

	it('allows only one active Vote, closes it before the next activation, and ends afterward', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Agenda i ordning',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const first = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Första',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});
		const second = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Andra',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!first || !second) throw new Error('Expected two draft Votes to be created');

		await openMeeting({ organizerUserId, meetingId: created.id });
		expect(
			await activateVote({ organizerUserId, meetingId: created.id, voteId: second.id })
		).toMatchObject({ revision: 4 });
		expect(
			await activateVote({ organizerUserId, meetingId: created.id, voteId: first.id })
		).toBeNull();
		expect(await context.getMeetingRevision(created.id)).toBe(4);
		expect(await endMeeting({ organizerUserId, meetingId: created.id })).toBeNull();
		expect(await context.getMeetingRevision(created.id)).toBe(4);

		expect(
			await closeVote({ organizerUserId, meetingId: created.id, voteId: first.id })
		).toBeNull();
		const closed = await closeVote({ organizerUserId, meetingId: created.id, voteId: second.id });
		expect(closed).toMatchObject({ lifecycle: 'open', revision: 5 });
		expect(await getParticipantProjection(created.publicLocator)).toMatchObject({
			state: 'closed',
			revision: 5
		});

		const next = await activateNextVote({ organizerUserId, meetingId: created.id });
		expect(next).toMatchObject({ revision: 6 });
		expect(next?.agenda.find(({ id }) => id === first.id)).toMatchObject({ lifecycle: 'open' });
		await closeVote({ organizerUserId, meetingId: created.id, voteId: first.id });
		const ended = await endMeeting({ organizerUserId, meetingId: created.id });
		expect(ended).toMatchObject({ lifecycle: 'closed', revision: 8 });
		expect(await getParticipantProjection(created.publicLocator)).toMatchObject({
			state: 'ended',
			revision: 8
		});
		expect(await endMeeting({ organizerUserId, meetingId: created.id })).toBeNull();
	});

	it('rejects stale lifecycle commands without advancing the Meeting revision', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Stale kommandon',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Fråga',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected a draft Vote to be created');

		await openMeeting({ organizerUserId, meetingId: created.id, expectedRevision: 1 });
		expect(
			await activateVote({
				organizerUserId,
				meetingId: created.id,
				voteId: vote.id,
				expectedRevision: 1
			})
		).toBeNull();
		expect(await context.getMeetingRevision(created.id)).toBe(2);
		expect(
			await activateVote({
				organizerUserId,
				meetingId: created.id,
				voteId: vote.id,
				expectedRevision: 2
			})
		).toMatchObject({ revision: 3 });
		expect(
			await closeVote({
				organizerUserId,
				meetingId: created.id,
				voteId: vote.id,
				expectedRevision: 2
			})
		).toMatchObject({ lifecycle: 'open', revision: 4 });
		expect(await context.getMeetingRevision(created.id)).toBe(4);
	});

	it('deletes only unopened Meetings owned by the Organizer', async () => {
		const organizerUserId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Planeringsmöte',
			expectedParticipantCount: null
		});
		const otherMeeting = await createDraftMeeting({
			organizerUserId: otherOrganizerId,
			title: 'Annat möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id, otherMeeting.id);

		expect(await deleteMeeting({ organizerUserId: otherOrganizerId, meetingId: created.id })).toBe(
			false
		);
		expect(await deleteMeeting({ organizerUserId, meetingId: created.id })).toBe(true);
		expect(await getParticipantProjection(created.publicLocator)).toEqual({
			state: 'invalid',
			message: 'Möteslänken kunde inte hittas.'
		});
	});

	it('deletes a draft Meeting and its configured agenda children', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med agenda',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Beslut',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Val',
			kind: 'selection',
			positionCount: 1,
			options: ['Ada', 'Bo']
		});

		expect(await deleteMeeting({ organizerUserId, meetingId: created.id })).toBe(true);

		const [counts] = await sql`
			SELECT
				(SELECT count(*) FROM vote WHERE meeting_id = ${created.id}) AS votes,
				(SELECT count(*) FROM decision_vote_config WHERE vote_id IN (
					SELECT id FROM vote WHERE meeting_id = ${created.id}
				)) AS decision_configs,
				(SELECT count(*) FROM selection_vote_config WHERE vote_id IN (
					SELECT id FROM vote WHERE meeting_id = ${created.id}
				)) AS selection_configs,
				(SELECT count(*) FROM selection_option WHERE vote_id IN (
					SELECT id FROM vote WHERE meeting_id = ${created.id}
				)) AS options
		`;

		expect({
			votes: Number(counts.votes),
			decisionConfigs: Number(counts.decision_configs),
			selectionConfigs: Number(counts.selection_configs),
			options: Number(counts.options)
		}).toEqual({ votes: 0, decisionConfigs: 0, selectionConfigs: 0, options: 0 });
	});

	it('deletes draft participation while preserving nullable diagnostics', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med deltagardata',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		const vote = await addDraftVote({
			organizerUserId,
			meetingId: created.id,
			title: 'Beslut',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!vote) throw new Error('Expected a draft Vote to be created');

		const participantTokenId = randomUUID();
		const ballotId = randomUUID();
		const anomalyId = randomUUID();

		await sql`
			INSERT INTO participant_token (id, meeting_id, token_hash)
			VALUES (${participantTokenId}, ${created.id}, ${randomUUID()})
		`;
		await sql`
			INSERT INTO ballot (id, meeting_id, vote_id, participant_token_id, payload)
			VALUES (
				${ballotId},
				${created.id},
				${vote.id},
				${participantTokenId},
				${JSON.stringify({ type: 'decision', choice: 'support' })}::jsonb
			)
		`;
		await sql`
			INSERT INTO participant_token_anomaly (id, name, meeting_id, vote_id, payload)
			VALUES (
				${anomalyId},
				'participant_token_unrecognized',
				${created.id},
				${vote.id},
				${JSON.stringify({ operation: 'read', tokenState: 'unrecognized' })}::jsonb
			)
		`;

		expect(await deleteMeeting({ organizerUserId, meetingId: created.id })).toBe(true);

		const [counts] = await sql`
			SELECT
				(SELECT count(*) FROM participant_token WHERE id = ${participantTokenId}) AS tokens,
				(SELECT count(*) FROM ballot WHERE id = ${ballotId}) AS ballots
		`;
		expect({
			tokens: Number(counts.tokens),
			ballots: Number(counts.ballots)
		}).toEqual({ tokens: 0, ballots: 0 });

		const [anomaly] = await sql`
			SELECT meeting_id, vote_id
			FROM participant_token_anomaly
			WHERE id = ${anomalyId}
		`;
		expect(anomaly).toEqual({ meeting_id: null, vote_id: null });
		await sql`DELETE FROM participant_token_anomaly WHERE id = ${anomalyId}`;
	});

	it('does not delete an open Meeting', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Pågående möte',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);
		await openMeeting({ organizerUserId, meetingId: created.id });

		expect(await deleteMeeting({ organizerUserId, meetingId: created.id })).toBe(false);
	});

	it('updates the expected participant count without closing the Meeting', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Budgetmöte',
			expectedParticipantCount: 10
		});
		context.trackMeetings(created.id);

		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { expectedParticipantCount: 10 }
			})
		).toBe(true);
		expect(await context.getMeetingRevision(created.id)).toBe(0);

		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { expectedParticipantCount: null }
			})
		).toBe(true);
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({
			id: created.id,
			lifecycle: 'draft',
			expectedParticipantCount: null,
			revision: 1
		});
	});

	it('persists Presentation QR visibility for draft and open Meetings', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Möte med QR-kod',
			expectedParticipantCount: null
		});
		context.trackMeetings(created.id);

		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { presentationQrEnabled: true }
			})
		).toBe(true);
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ presentationQrEnabled: true, revision: 1 });

		await openMeeting({ organizerUserId, meetingId: created.id });
		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { presentationQrEnabled: false }
			})
		).toBe(true);
		expect(
			await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: created.publicLocator
			})
		).toMatchObject({ presentationQrEnabled: false, lifecycle: 'open', revision: 3 });

		await sql`
			UPDATE meeting
			SET lifecycle = 'closed', opened_at = now(), closed_at = now()
			WHERE id = ${created.id}
		`;
		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { presentationQrEnabled: true }
			})
		).toBe(false);
	});

	it('does not update a Meeting for another Organizer', async () => {
		const ownerId = await context.insertOrganizer();
		const otherOrganizerId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId: ownerId,
			title: 'Privat möte',
			expectedParticipantCount: 8
		});
		context.trackMeetings(created.id);

		expect(
			await updateMeetingSettings({
				organizerUserId: otherOrganizerId,
				meetingId: created.id,
				settings: { expectedParticipantCount: 99 }
			})
		).toBe(false);
	});

	it('does not update a closed Meeting', async () => {
		const organizerUserId = await context.insertOrganizer();
		const created = await createDraftMeeting({
			organizerUserId,
			title: 'Avslutat möte',
			expectedParticipantCount: 8
		});
		context.trackMeetings(created.id);

		await sql`
				UPDATE meeting
				SET lifecycle = 'closed', opened_at = now(), closed_at = now()
				WHERE id = ${created.id}
			`;

		expect(
			await updateMeetingSettings({
				organizerUserId,
				meetingId: created.id,
				settings: { expectedParticipantCount: 99 }
			})
		).toBe(false);
	});
});
