import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDraftVote } from '#lib/server/agenda/index.js';
import {
	closeVote,
	endMeeting,
	activateVote,
	createDraftMeeting,
	getParticipantPageProjection,
	getParticipantProjection,
	openMeeting
} from '#lib/server/meeting/index.js';
import { createActiveVoteKey } from '#lib/server/meeting/active-vote-key.js';
import {
	submitDecisionBallot,
	submitSelectionBallot,
	withdrawDecisionBallot,
	withdrawSelectionBallot,
	StaleActiveVoteError
} from '#lib/server/ballot/index.js';
import { createServerTestContext } from '#lib/server/testing/database.js';

const context = createServerTestContext();
const activeVoteKeys = new Map<string, string>();

describe('Vote Ballots', () => {
	beforeAll(async () => {
		await context.connect();
	});

	afterEach(async () => {
		await context.cleanup();
		activeVoteKeys.clear();
	});

	afterAll(async () => {
		await context.close();
	});

	function rememberActiveVote(publicLocator: string, voteId: string) {
		const activeVoteKey = createActiveVoteKey(voteId);
		activeVoteKeys.set(publicLocator, activeVoteKey);
		return activeVoteKey;
	}

	function currentActiveVoteKey(publicLocator: string) {
		const activeVoteKey = activeVoteKeys.get(publicLocator);
		if (!activeVoteKey) throw new Error('Expected the test fixture to have an active Vote');
		return activeVoteKey;
	}

	async function decisionBallot(input: {
		publicLocator: string;
		choice: 'support' | 'oppose' | 'abstention';
		rawParticipantToken?: string;
		activeVoteKey?: string;
	}) {
		return submitDecisionBallot({
			...input,
			activeVoteKey: input.activeVoteKey ?? (await currentActiveVoteKey(input.publicLocator))
		});
	}

	async function selectionBallot(input: {
		publicLocator: string;
		selectedOptionIds: string[];
		vacancyCount: number;
		abstain: boolean;
		rawParticipantToken?: string;
		activeVoteKey?: string;
	}) {
		return submitSelectionBallot({
			...input,
			activeVoteKey: input.activeVoteKey ?? (await currentActiveVoteKey(input.publicLocator))
		});
	}

	async function createActiveDecisionVote() {
		const organizerUserId = await context.insertOrganizer();
		const meetingRecord = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meetingRecord.id);
		const voteRecord = await addDraftVote({
			organizerUserId,
			meetingId: meetingRecord.id,
			title: 'Godkänn budgeten',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!voteRecord) throw new Error('Expected the Decision Vote to be created');

		await openMeeting({ organizerUserId, meetingId: meetingRecord.id });
		await activateVote({
			organizerUserId,
			meetingId: meetingRecord.id,
			voteId: voteRecord.id
		});
		rememberActiveVote(meetingRecord.publicLocator, voteRecord.id);

		return { organizerUserId, meeting: meetingRecord, vote: voteRecord };
	}

	async function createActiveSelectionVote({
		positionCount = 1,
		vacancyEnabled = true,
		options = ['Ada', 'Bo', 'Cia']
	}: {
		positionCount?: number;
		vacancyEnabled?: boolean;
		options?: string[];
	} = {}) {
		const organizerUserId = await context.insertOrganizer();
		const meetingRecord = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meetingRecord.id);
		const voteRecord = await addDraftVote({
			organizerUserId,
			meetingId: meetingRecord.id,
			title: 'Välj styrelse',
			kind: 'selection',
			positionCount,
			vacancyEnabled,
			options
		});
		if (!voteRecord || voteRecord.kind !== 'selection') {
			throw new Error('Expected the Selection Vote to be created');
		}

		await openMeeting({ organizerUserId, meetingId: meetingRecord.id });
		await activateVote({
			organizerUserId,
			meetingId: meetingRecord.id,
			voteId: voteRecord.id
		});
		rememberActiveVote(meetingRecord.publicLocator, voteRecord.id);

		return { organizerUserId, meeting: meetingRecord, vote: voteRecord };
	}

	it('creates a lazy one-way Participant token and accepts a Decision Ballot', async () => {
		const { meeting } = await createActiveDecisionVote();

		const result = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'support'
		});

		if (!result?.createdToken) throw new Error('Expected a Participant token to be created');
		expect(result).toMatchObject({ changed: true });
		expect(result.createdToken).not.toHaveLength(0);

		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			state: 'active',
			participation: { current: 1, expected: 12 }
		});
	});

	it('replaces and withdraws one current Ballot for the same Participant token', async () => {
		const { meeting } = await createActiveDecisionVote();
		const first = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'support'
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		const replacement = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'oppose',
			rawParticipantToken: first.createdToken
		});

		expect(replacement).toEqual({ changed: true, createdToken: null });
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({ revision: 5 });

		const withdrawn = await withdrawDecisionBallot({
			publicLocator: meeting.publicLocator,
			rawParticipantToken: first.createdToken
		});

		expect(withdrawn).toEqual({ changed: true });
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 0, expected: 12 }
		});
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({ revision: 6 });
	});

	it('reads back only the matching Decision Ballot while the Vote is open', async () => {
		const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
		const withoutToken = await getParticipantPageProjection(meeting.publicLocator);
		expect(withoutToken).toMatchObject({ state: 'active', currentBallot: null });

		const submitted = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'support'
		});
		if (!submitted?.createdToken) throw new Error('Expected a Participant token to be created');

		expect(
			await getParticipantPageProjection(meeting.publicLocator, submitted.createdToken)
		).toMatchObject({
			state: 'active',
			currentBallot: { type: 'decision', choice: 'support' }
		});
		expect(await getParticipantProjection(meeting.publicLocator)).not.toHaveProperty(
			'currentBallot'
		);

		await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
		expect(
			await getParticipantPageProjection(meeting.publicLocator, submitted.createdToken)
		).toMatchObject({ state: 'closed' });
	});

	it('reads back Selection option ids and explicit Vacancy count', async () => {
		const { meeting, vote } = await createActiveSelectionVote({ positionCount: 3 });
		const selectedOptionIds = vote.selection.options.slice(0, 2).map(({ id }) => id);
		const submitted = await selectionBallot({
			publicLocator: meeting.publicLocator,
			selectedOptionIds,
			vacancyCount: 1,
			abstain: false
		});
		if (!submitted?.createdToken) throw new Error('Expected a Participant token to be created');

		expect(
			await getParticipantPageProjection(meeting.publicLocator, submitted.createdToken)
		).toMatchObject({
			state: 'active',
			currentBallot: { type: 'selection', selectedOptionIds, vacancyCount: 1, abstain: false }
		});
	});

	it('does not read another Participant token or Meeting Ballot and records safe anomalies', async () => {
		const firstMeeting = await createActiveDecisionVote();
		const first = await decisionBallot({
			publicLocator: firstMeeting.meeting.publicLocator,
			choice: 'support'
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		const secondMeeting = await createActiveDecisionVote();
		const wrongMeetingRead = await getParticipantPageProjection(
			secondMeeting.meeting.publicLocator,
			first.createdToken
		);
		expect(wrongMeetingRead).toMatchObject({ state: 'active', currentBallot: null });

		const unknownToken = 'unrecognized-token';
		expect(
			await getParticipantPageProjection(secondMeeting.meeting.publicLocator, unknownToken)
		).toMatchObject({ state: 'active', currentBallot: null });
		await decisionBallot({
			publicLocator: secondMeeting.meeting.publicLocator,
			choice: 'oppose',
			rawParticipantToken: unknownToken
		});
		await withdrawDecisionBallot({
			publicLocator: secondMeeting.meeting.publicLocator,
			rawParticipantToken: unknownToken
		});

		const diagnostics = await context.sql`
			SELECT name, payload
			FROM participant_token_anomaly
			WHERE meeting_id = ${secondMeeting.meeting.id}
			ORDER BY name
		`;
		expect(diagnostics).toHaveLength(2);
		expect(diagnostics.map(({ name }) => name)).toEqual([
			'participant_token_unrecognized',
			'participant_token_wrong_meeting'
		]);
		for (const diagnostic of diagnostics) {
			expect(JSON.stringify(diagnostic.payload)).not.toContain(unknownToken);
			expect(JSON.stringify(diagnostic.payload)).not.toContain(first.createdToken);
		}
	});

	it('allows an Organizer to close a Vote after a Participant submits a Ballot', async () => {
		const { organizerUserId, meeting, vote } = await createActiveDecisionVote();

		await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'support'
		});

		const closed = await closeVote({
			organizerUserId,
			meetingId: meeting.id,
			voteId: vote.id
		});

		expect(closed).toMatchObject({
			lifecycle: 'open'
		});
	});

	it('scopes a Participant token to its Meeting', async () => {
		const firstMeeting = await createActiveDecisionVote();
		const first = await decisionBallot({
			publicLocator: firstMeeting.meeting.publicLocator,
			choice: 'support'
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		const secondMeeting = await createActiveDecisionVote();
		const second = await decisionBallot({
			publicLocator: secondMeeting.meeting.publicLocator,
			choice: 'oppose',
			rawParticipantToken: first.createdToken
		});
		if (!second?.createdToken) throw new Error('Expected a Meeting-scoped token to be created');

		expect(second.createdToken).not.toBe(first.createdToken);
		expect(await getParticipantProjection(firstMeeting.meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
		expect(await getParticipantProjection(secondMeeting.meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
	});

	it("does not recover a lost token or replace another Participant's Ballot", async () => {
		const { meeting } = await createActiveDecisionVote();
		const first = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'support'
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		const second = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'abstention'
		});

		if (!second?.createdToken) throw new Error('Expected a second Participant token to be created');
		expect(second.createdToken).not.toBe(first.createdToken);
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 2, expected: 12 }
		});
	});

	it('rejects Ballot changes after Vote Close and Meeting end', async () => {
		const closedVote = await createActiveDecisionVote();
		const closedVoteKey = await currentActiveVoteKey(closedVote.meeting.publicLocator);
		const first = await decisionBallot({
			publicLocator: closedVote.meeting.publicLocator,
			choice: 'support',
			activeVoteKey: closedVoteKey
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		await closeVote({
			organizerUserId: closedVote.organizerUserId,
			meetingId: closedVote.meeting.id,
			voteId: closedVote.vote.id
		});
		expect(
			await decisionBallot({
				publicLocator: closedVote.meeting.publicLocator,
				choice: 'oppose',
				activeVoteKey: closedVoteKey,
				rawParticipantToken: first.createdToken
			})
		).toBeNull();

		const endedMeeting = await createActiveDecisionVote();
		const second = await decisionBallot({
			publicLocator: endedMeeting.meeting.publicLocator,
			choice: 'support'
		});
		if (!second?.createdToken) throw new Error('Expected a Participant token to be created');
		await closeVote({
			organizerUserId: endedMeeting.organizerUserId,
			meetingId: endedMeeting.meeting.id,
			voteId: endedMeeting.vote.id
		});
		await endMeeting({
			organizerUserId: endedMeeting.organizerUserId,
			meetingId: endedMeeting.meeting.id
		});

		expect(
			await withdrawDecisionBallot({
				publicLocator: endedMeeting.meeting.publicLocator,
				rawParticipantToken: second.createdToken
			})
		).toBeNull();
	});

	it('serializes a Ballot submission with a concurrent Vote Close', async () => {
		const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
		const activeVoteKey = await currentActiveVoteKey(meeting.publicLocator);

		const [submission, closed] = await Promise.all([
			decisionBallot({ publicLocator: meeting.publicLocator, choice: 'support', activeVoteKey }),
			closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
		]);

		expect(closed).toMatchObject({ lifecycle: 'open' });
		if (submission) expect(submission.changed).toBe(true);
	});

	it('accepts a single-winner option, Abstention, and configured Vacancy', async () => {
		const { meeting, vote } = await createActiveSelectionVote();
		const optionId = vote.selection.options[0]?.id;
		if (!optionId) throw new Error('Expected a Selection option');

		const first = await selectionBallot({
			publicLocator: meeting.publicLocator,
			selectedOptionIds: [optionId],
			vacancyCount: 0,
			abstain: false
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');
		expect(first).toMatchObject({ changed: true });

		expect(
			await selectionBallot({
				publicLocator: meeting.publicLocator,
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true,
				rawParticipantToken: first.createdToken
			})
		).toEqual({ changed: true, createdToken: null });

		expect(
			await selectionBallot({
				publicLocator: meeting.publicLocator,
				selectedOptionIds: [],
				vacancyCount: 1,
				abstain: false,
				rawParticipantToken: first.createdToken
			})
		).toEqual({ changed: true, createdToken: null });

		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
	});

	it('accepts distinct multi-winner options plus bounded Vacancy positions', async () => {
		const { meeting, vote } = await createActiveSelectionVote({ positionCount: 3 });
		const selectedOptionIds = vote.selection.options.slice(0, 2).map(({ id }) => id);

		const result = await selectionBallot({
			publicLocator: meeting.publicLocator,
			selectedOptionIds,
			vacancyCount: 1,
			abstain: false
		});

		if (!result?.createdToken) throw new Error('Expected a Participant token to be created');
		expect(result).toMatchObject({ changed: true });
	});

	it('rejects duplicate, foreign, excessive, and unsupported Selection Ballot values', async () => {
		const active = await createActiveSelectionVote({ positionCount: 2 });
		const optionIds = active.vote.selection.options.slice(0, 2).map(({ id }) => id);
		const firstOptionId = optionIds[0];
		if (!firstOptionId) throw new Error('Expected a Selection option');

		await expect(
			selectionBallot({
				publicLocator: active.meeting.publicLocator,
				selectedOptionIds: [firstOptionId, firstOptionId],
				vacancyCount: 0,
				abstain: false
			})
		).rejects.toThrow();
		await expect(
			selectionBallot({
				publicLocator: active.meeting.publicLocator,
				selectedOptionIds: optionIds,
				vacancyCount: 1,
				abstain: false
			})
		).rejects.toThrow();
		await expect(
			selectionBallot({
				publicLocator: active.meeting.publicLocator,
				selectedOptionIds: [firstOptionId],
				vacancyCount: 2,
				abstain: false
			})
		).rejects.toThrow();

		const other = await createActiveSelectionVote({
			positionCount: 1,
			options: ['Dora', 'Eli']
		});
		await expect(
			selectionBallot({
				publicLocator: other.meeting.publicLocator,
				selectedOptionIds: [firstOptionId],
				vacancyCount: 0,
				abstain: false
			})
		).rejects.toThrow();

		const noVacancy = await createActiveSelectionVote({
			positionCount: 1,
			vacancyEnabled: false
		});
		await expect(
			selectionBallot({
				publicLocator: noVacancy.meeting.publicLocator,
				selectedOptionIds: [],
				vacancyCount: 1,
				abstain: false
			})
		).rejects.toThrow();
	});

	it('replaces and withdraws one current multi-winner Ballot', async () => {
		const { meeting, vote } = await createActiveSelectionVote({ positionCount: 2 });
		const firstOptionId = vote.selection.options[0]?.id;
		const secondOptionId = vote.selection.options[1]?.id;
		if (!firstOptionId || !secondOptionId) throw new Error('Expected two Selection options');

		const first = await selectionBallot({
			publicLocator: meeting.publicLocator,
			selectedOptionIds: [firstOptionId],
			vacancyCount: 1,
			abstain: false
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		expect(
			await selectionBallot({
				publicLocator: meeting.publicLocator,
				selectedOptionIds: [secondOptionId],
				vacancyCount: 1,
				abstain: false,
				rawParticipantToken: first.createdToken
			})
		).toEqual({ changed: true, createdToken: null });
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});

		expect(
			await withdrawSelectionBallot({
				publicLocator: meeting.publicLocator,
				rawParticipantToken: first.createdToken
			})
		).toEqual({ changed: true });
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 0, expected: 12 }
		});
	});

	it('rejects Selection Ballot changes after Vote Close and serializes a concurrent Close', async () => {
		const closedVote = await createActiveSelectionVote();
		const closedOptionId = closedVote.vote.selection.options[0]?.id;
		if (!closedOptionId) throw new Error('Expected a Selection option');
		const closedVoteKey = await currentActiveVoteKey(closedVote.meeting.publicLocator);
		const first = await selectionBallot({
			publicLocator: closedVote.meeting.publicLocator,
			selectedOptionIds: [closedOptionId],
			vacancyCount: 0,
			abstain: false,
			activeVoteKey: closedVoteKey
		});
		if (!first?.createdToken) throw new Error('Expected a Participant token to be created');

		await closeVote({
			organizerUserId: closedVote.organizerUserId,
			meetingId: closedVote.meeting.id,
			voteId: closedVote.vote.id
		});
		expect(
			await selectionBallot({
				publicLocator: closedVote.meeting.publicLocator,
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true,
				activeVoteKey: closedVoteKey,
				rawParticipantToken: first.createdToken
			})
		).toBeNull();
		expect(
			await withdrawSelectionBallot({
				publicLocator: closedVote.meeting.publicLocator,
				rawParticipantToken: first.createdToken
			})
		).toBeNull();

		const concurrent = await createActiveSelectionVote();
		const concurrentOptionId = concurrent.vote.selection.options[0]?.id;
		if (!concurrentOptionId) throw new Error('Expected a Selection option');
		const concurrentVoteKey = await currentActiveVoteKey(concurrent.meeting.publicLocator);
		const [submission, closed] = await Promise.all([
			selectionBallot({
				publicLocator: concurrent.meeting.publicLocator,
				selectedOptionIds: [concurrentOptionId],
				vacancyCount: 0,
				abstain: false,
				activeVoteKey: concurrentVoteKey
			}),
			closeVote({
				organizerUserId: concurrent.organizerUserId,
				meetingId: concurrent.meeting.id,
				voteId: concurrent.vote.id
			})
		]);

		expect(closed).toMatchObject({ lifecycle: 'open' });
		if (submission) expect(submission.changed).toBe(true);
		expect(await getParticipantProjection(concurrent.meeting.publicLocator)).toMatchObject({
			state: 'closed'
		});
		expect(
			await selectionBallot({
				publicLocator: concurrent.meeting.publicLocator,
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true,
				activeVoteKey: concurrentVoteKey
			})
		).toBeNull();
	});

	it('rejects a Decision Ballot submitted for a previous Active Vote', async () => {
		const organizerUserId = await context.insertOrganizer();
		const meeting = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meeting.id);
		const firstVote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Godkänn budgeten',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		const secondVote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Godkänn verksamhetsberättelsen',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});
		if (!firstVote || !secondVote) throw new Error('Expected two Decision Votes');

		await openMeeting({ organizerUserId, meetingId: meeting.id });
		await activateVote({
			organizerUserId,
			meetingId: meeting.id,
			voteId: firstVote.id
		});
		rememberActiveVote(meeting.publicLocator, firstVote.id);
		const staleActiveVoteKey = await currentActiveVoteKey(meeting.publicLocator);

		await closeVote({ organizerUserId, meetingId: meeting.id, voteId: firstVote.id });
		await activateVote({
			organizerUserId,
			meetingId: meeting.id,
			voteId: secondVote.id
		});
		rememberActiveVote(meeting.publicLocator, secondVote.id);

		const before = await getParticipantProjection(meeting.publicLocator);
		if (before.state !== 'active') throw new Error('Expected the second Vote to be active');

		await expect(
			decisionBallot({
				publicLocator: meeting.publicLocator,
				choice: 'support',
				activeVoteKey: staleActiveVoteKey
			})
		).rejects.toBeInstanceOf(StaleActiveVoteError);

		const after = await getParticipantProjection(meeting.publicLocator);
		expect(after).toMatchObject({
			state: 'active',
			participation: { current: 0, expected: 12 },
			revision: before.revision
		});
		expect(await getParticipantPageProjection(meeting.publicLocator)).toMatchObject({
			currentBallot: null
		});

		const accepted = await decisionBallot({
			publicLocator: meeting.publicLocator,
			choice: 'oppose'
		});
		if (!accepted?.createdToken) throw new Error('Expected a Participant token for the new Vote');
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
		expect(
			await getParticipantPageProjection(meeting.publicLocator, accepted.createdToken)
		).toMatchObject({
			currentBallot: { type: 'decision', choice: 'oppose' }
		});
	});

	it('rejects a Selection Ballot submitted for a previous Active Vote', async () => {
		const organizerUserId = await context.insertOrganizer();
		const meeting = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meeting.id);
		const firstVote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Välj ordförande',
			kind: 'selection',
			positionCount: 1,
			vacancyEnabled: true,
			options: ['Ada', 'Bo']
		});
		const secondVote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Välj sekreterare',
			kind: 'selection',
			positionCount: 1,
			vacancyEnabled: true,
			options: ['Cia', 'Dora']
		});
		if (
			!firstVote ||
			firstVote.kind !== 'selection' ||
			!secondVote ||
			secondVote.kind !== 'selection'
		) {
			throw new Error('Expected two Selection Votes');
		}
		const firstOptionId = firstVote.selection.options[0]?.id;
		const secondOptionId = secondVote.selection.options[0]?.id;
		if (!firstOptionId || !secondOptionId) throw new Error('Expected a Selection option');

		await openMeeting({ organizerUserId, meetingId: meeting.id });
		await activateVote({
			organizerUserId,
			meetingId: meeting.id,
			voteId: firstVote.id
		});
		rememberActiveVote(meeting.publicLocator, firstVote.id);
		const staleActiveVoteKey = await currentActiveVoteKey(meeting.publicLocator);

		await closeVote({ organizerUserId, meetingId: meeting.id, voteId: firstVote.id });
		await activateVote({
			organizerUserId,
			meetingId: meeting.id,
			voteId: secondVote.id
		});
		rememberActiveVote(meeting.publicLocator, secondVote.id);

		const before = await getParticipantProjection(meeting.publicLocator);
		if (before.state !== 'active') throw new Error('Expected the second Vote to be active');

		await expect(
			selectionBallot({
				publicLocator: meeting.publicLocator,
				selectedOptionIds: [firstOptionId],
				vacancyCount: 0,
				abstain: false,
				activeVoteKey: staleActiveVoteKey
			})
		).rejects.toBeInstanceOf(StaleActiveVoteError);

		const after = await getParticipantProjection(meeting.publicLocator);
		expect(after).toMatchObject({
			state: 'active',
			participation: { current: 0, expected: 12 },
			revision: before.revision
		});
		expect(await getParticipantPageProjection(meeting.publicLocator)).toMatchObject({
			currentBallot: null
		});

		const accepted = await selectionBallot({
			publicLocator: meeting.publicLocator,
			selectedOptionIds: [secondOptionId],
			vacancyCount: 0,
			abstain: false
		});
		if (!accepted?.createdToken) throw new Error('Expected a Participant token for the new Vote');
		expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
			participation: { current: 1, expected: 12 }
		});
		expect(
			await getParticipantPageProjection(meeting.publicLocator, accepted.createdToken)
		).toMatchObject({
			currentBallot: {
				type: 'selection',
				selectedOptionIds: [secondOptionId],
				vacancyCount: 0,
				abstain: false
			}
		});
	});
});
