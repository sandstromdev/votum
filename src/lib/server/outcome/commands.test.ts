import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDraftVote } from '#lib/server/agenda/index.js';
import {
	activateVote,
	closeVote,
	createDraftMeeting,
	endMeeting,
	getOrganizerMeetingByLocator,
	getParticipantProjection,
	getPresentationProjection,
	invalidateVote,
	openMeeting,
	revealVote,
	rerunVote,
	resolveIncompleteVote,
	setPublicResultBreakdown,
	updateMeetingSettings
} from '#lib/server/meeting/index.js';
import { submitDecisionBallot, submitSelectionBallot } from '#lib/server/ballot/index.js';
import { createActiveVoteKey } from '#lib/server/meeting/active-vote-key.js';
import { createServerTestContext } from '#lib/server/testing/database.js';
import type { DecisionBallotChoice } from '#lib/vote/ballot.js';

const context = createServerTestContext();
const activeVoteKeys = new Map<string, string>();

describe('Vote outcomes', () => {
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

	async function decisionBallot(publicLocator: string, choice: DecisionBallotChoice) {
		return submitDecisionBallot({
			publicLocator,
			choice,
			activeVoteKey: await currentActiveVoteKey(publicLocator)
		});
	}

	async function selectionBallot(
		publicLocator: string,
		input: { selectedOptionIds: string[]; vacancyCount: number; abstain: boolean }
	) {
		return submitSelectionBallot({
			publicLocator,
			...input,
			activeVoteKey: await currentActiveVoteKey(publicLocator)
		});
	}

	async function createActiveDecisionVote({
		majorityRule = 'simple',
		abstentionsCounted = false
	}: { majorityRule?: 'simple' | 'qualified'; abstentionsCounted?: boolean } = {}) {
		const organizerUserId = await context.insertOrganizer();
		const meeting = await createDraftMeeting({
			organizerUserId,
			title: 'Årsmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meeting.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Godkänn budgeten',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår',
			majorityRule,
			abstentionsCounted
		});
		if (!vote) throw new Error('Expected a Decision Vote');
		await openMeeting({ organizerUserId, meetingId: meeting.id });
		await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
		rememberActiveVote(meeting.publicLocator, vote.id);
		return { organizerUserId, meeting, vote };
	}

	async function createActiveSelectionVote({
		positionCount = 1,
		vacancyEnabled = true,
		options = ['Ada', 'Bo', 'Cleo']
	}: { positionCount?: number; vacancyEnabled?: boolean; options?: string[] } = {}) {
		const organizerUserId = await context.insertOrganizer();
		const meeting = await createDraftMeeting({
			organizerUserId,
			title: 'Valmöte',
			expectedParticipantCount: 12
		});
		context.trackMeetings(meeting.id);
		const vote = await addDraftVote({
			organizerUserId,
			meetingId: meeting.id,
			title: 'Välj styrelse',
			kind: 'selection',
			positionCount,
			vacancyEnabled,
			options
		});
		if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');

		await openMeeting({ organizerUserId, meetingId: meeting.id });
		await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
		rememberActiveVote(meeting.publicLocator, vote.id);
		return { organizerUserId, meeting, vote };
	}

	async function createIncompleteSelectionVote({
		positionCount = 3,
		vacancyCount = 0
	}: { positionCount?: number; vacancyCount?: number } = {}) {
		const active = await createActiveSelectionVote({ positionCount });
		const [ada] = active.vote.selection.options;
		if (!ada) throw new Error('Expected a Selection option');
		await selectionBallot(active.meeting.publicLocator, {
			selectedOptionIds: [ada.id],
			vacancyCount,
			abstain: false
		});
		await closeVote({
			organizerUserId: active.organizerUserId,
			meetingId: active.meeting.id,
			voteId: active.vote.id
		});
		return { ...active, ada };
	}

	describe('closing and revealing Votes', () => {
		it('closes a Decision Vote into an organizer-only aggregate snapshot', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			await decisionBallot(meeting.publicLocator, 'support');
			await decisionBallot(meeting.publicLocator, 'support');
			await decisionBallot(meeting.publicLocator, 'oppose');

			const closed = await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			expect(closed?.agenda[0]).toMatchObject({
				lifecycle: 'closed',
				revealed: false,
				publicResultBreakdownEnabled: false,
				outcome: {
					document: {
						vote: {
							kind: 'decision',
							title: 'Godkänn budgeten',
							decision: { supportLabel: 'För', opposeLabel: 'Emot', abstentionLabel: 'Avstår' }
						},
						expectedParticipantCount: 12,
						ballotCount: 3,
						counts: { support: 2, oppose: 1, abstention: 0 },
						outcome: { state: 'winner', winner: 'support' }
					}
				}
			});

			expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
				state: 'closed',
				participation: { current: 3, expected: 12 },
				vote: { title: 'Godkänn budgeten' },
				result: { revealed: false }
			});
			expect(await getPresentationProjection(meeting.publicLocator)).toMatchObject({
				state: 'closed',
				result: { revealed: false }
			});
			expect(JSON.stringify(await getParticipantProjection(meeting.publicLocator))).not.toContain(
				'counts'
			);
		});

		it('reveals only the final result and keeps the snapshot fixed', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			await decisionBallot(meeting.publicLocator, 'support');
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const revealed = await revealVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			expect(revealed?.agenda[0]).toMatchObject({ lifecycle: 'closed', revealed: true });
			expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
				state: 'closed',
				result: {
					revealed: true,
					final: { state: 'winner', winner: 'support' }
				}
			});
			expect(await getPresentationProjection(meeting.publicLocator)).toMatchObject({
				state: 'closed',
				result: { revealed: true, final: { state: 'winner', winner: 'support' } }
			});
			expect(JSON.stringify(await getParticipantProjection(meeting.publicLocator))).not.toContain(
				'counts'
			);
			expect(await getParticipantProjection(meeting.publicLocator)).not.toMatchObject({
				result: { breakdown: expect.anything() }
			});

			expect(
				await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			).toBeNull();
		});

		it('publishes the optional aggregate breakdown without changing the final result', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			await decisionBallot(meeting.publicLocator, 'support');
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			const beforeBreakdown = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			const snapshotBeforeBreakdown = JSON.stringify(beforeBreakdown?.agenda[0]?.outcome?.document);

			const enabled = await setPublicResultBreakdown({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				enabled: true
			});

			expect(enabled?.agenda[0]).toMatchObject({ publicResultBreakdownEnabled: true });
			const unchanged = await setPublicResultBreakdown({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				enabled: true
			});
			expect(unchanged?.revision).toBe(enabled?.revision);
			expect(unchanged?.agenda[0]).toMatchObject({ publicResultBreakdownEnabled: true });
			const afterBreakdown = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			expect(JSON.stringify(afterBreakdown?.agenda[0]?.outcome?.document)).toBe(
				snapshotBeforeBreakdown
			);
			expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
				state: 'closed',
				result: {
					revealed: true,
					final: { state: 'winner', winner: 'support' },
					breakdown: { support: 1, oppose: 0, abstention: 0 }
				}
			});
			expect(await getPresentationProjection(meeting.publicLocator)).toMatchObject({
				result: {
					revealed: true,
					breakdown: { support: 1, oppose: 0, abstention: 0 }
				}
			});
			expect(JSON.stringify(await getParticipantProjection(meeting.publicLocator))).not.toContain(
				'choice'
			);

			const disabled = await setPublicResultBreakdown({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				enabled: false
			});
			expect(disabled?.agenda[0]).toMatchObject({ publicResultBreakdownEnabled: false });
			expect(await getParticipantProjection(meeting.publicLocator)).not.toMatchObject({
				result: { breakdown: expect.anything() }
			});

			const snapshotBeforeSettingsChange = JSON.stringify(
				afterBreakdown?.agenda[0]?.outcome?.document
			);
			expect(afterBreakdown?.agenda[0]?.outcome?.document.expectedParticipantCount).toBe(12);
			await updateMeetingSettings({
				organizerUserId,
				meetingId: meeting.id,
				settings: { expectedParticipantCount: 99 }
			});
			const afterSettingsChange = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			expect(afterSettingsChange?.agenda[0]?.outcome?.document.expectedParticipantCount).toBe(12);
			expect(JSON.stringify(afterSettingsChange?.agenda[0]?.outcome?.document)).toBe(
				snapshotBeforeSettingsChange
			);
		});

		it('reveals Swedish rule metadata for passing, tied, and no-result Decisions', async () => {
			const cases: Array<{
				choices: Array<'support' | 'oppose' | 'abstention'>;
				state: 'winner' | 'tie' | 'no-result';
			}> = [
				{ choices: ['support'], state: 'winner' },
				{ choices: ['support', 'oppose'], state: 'tie' },
				{ choices: [], state: 'no-result' }
			];

			for (const testCase of cases) {
				const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
				for (const choice of testCase.choices) {
					await decisionBallot(meeting.publicLocator, choice);
				}
				await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
				await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

				expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
					result: {
						revealed: true,
						final: {
							state: testCase.state,
							majorityLabel: 'Enkel majoritet',
							abstentionsCounted: false
						}
					}
				});
				expect(await getPresentationProjection(meeting.publicLocator)).toMatchObject({
					result: {
						revealed: true,
						final: {
							state: testCase.state,
							majorityLabel: 'Enkel majoritet',
							abstentionsCounted: false
						}
					}
				});
			}
		});

		it('closes and reveals a rejected Qualified-majority Decision Vote with its rule metadata', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote({
				majorityRule: 'qualified',
				abstentionsCounted: true
			});
			await decisionBallot(meeting.publicLocator, 'support');
			await decisionBallot(meeting.publicLocator, 'support');
			await decisionBallot(meeting.publicLocator, 'oppose');
			await decisionBallot(meeting.publicLocator, 'abstention');

			const closed = await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(closed?.agenda[0]?.outcome?.document).toMatchObject({
				version: 2,
				vote: { decision: { majorityRule: 'qualified', abstentionsCounted: true } },
				counts: { support: 2, oppose: 1, abstention: 1 },
				outcome: { state: 'rejected', winner: null }
			});

			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
				result: {
					revealed: true,
					final: {
						state: 'rejected',
						winner: null,
						majorityLabel: 'Kvalificerad majoritet, avståenden räknades',
						abstentionsCounted: true
					}
				}
			});
			expect(await getPresentationProjection(meeting.publicLocator)).toMatchObject({
				result: {
					revealed: true,
					final: {
						state: 'rejected',
						majorityLabel: 'Kvalificerad majoritet, avståenden räknades',
						abstentionsCounted: true
					}
				}
			});
		});

		it('serializes concurrent Close commands into one snapshot', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			const [first, second] = await Promise.all([
				closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id }),
				closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			]);

			expect([first, second].filter(Boolean)).toHaveLength(1);
			const [snapshot] = await context.sql`
			SELECT document
			FROM outcome_snapshot
			WHERE vote_id = ${vote.id}
		`;
			expect(snapshot.document).toMatchObject({ ballotCount: 0, expectedParticipantCount: 12 });
		});

		it('closes a Selection Vote with option and Abstention counts', async () => {
			const organizerUserId = await context.insertOrganizer();
			const meeting = await createDraftMeeting({
				organizerUserId,
				title: 'Valmöte',
				expectedParticipantCount: null
			});
			context.trackMeetings(meeting.id);
			const vote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Välj ordförande',
				kind: 'selection',
				positionCount: 1,
				options: ['Ada', 'Bo']
			});
			if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');
			await openMeeting({ organizerUserId, meetingId: meeting.id });
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			rememberActiveVote(meeting.publicLocator, vote.id);
			const ada = vote.selection.options[0];
			if (!ada) throw new Error('Expected a Selection option');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 0,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true
			});

			const closed = await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(closed?.agenda[0]?.outcome?.document).toMatchObject({
				ballotCount: 2,
				counts: {
					options: [
						{ id: ada.id, label: 'Ada', count: 1 },
						{ label: 'Bo', count: 0 }
					],
					vacancy: 0,
					abstention: 1
				},
				outcome: { state: 'winner', winner: { type: 'option', id: ada.id, label: 'Ada' } }
			});
		});

		it('publishes Selection aggregate counts from the Close snapshot after reveal', async () => {
			const organizerUserId = await context.insertOrganizer();
			const meeting = await createDraftMeeting({
				organizerUserId,
				title: 'Valmöte',
				expectedParticipantCount: null
			});
			context.trackMeetings(meeting.id);
			const vote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Välj ordförande',
				kind: 'selection',
				positionCount: 1,
				options: ['Ada', 'Bo']
			});
			if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');
			await openMeeting({ organizerUserId, meetingId: meeting.id });
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			rememberActiveVote(meeting.publicLocator, vote.id);
			const ada = vote.selection.options[0];
			if (!ada) throw new Error('Expected a Selection option');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 0,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true
			});

			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			await setPublicResultBreakdown({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				enabled: true
			});

			const projection = await getParticipantProjection(meeting.publicLocator);
			expect(projection).toMatchObject({
				state: 'closed',
				result: {
					revealed: true,
					final: { kind: 'selection', state: 'winner', winner: { type: 'option', label: 'Ada' } },
					breakdown: {
						options: [
							{ label: 'Ada', count: 1 },
							{ label: 'Bo', count: 0 }
						],
						vacancy: 0,
						abstention: 1
					}
				}
			});
			expect(JSON.stringify(projection)).not.toContain(ada.id);
			expect(JSON.stringify(projection)).not.toContain('selectedOptionIds');
		});

		it('keeps Multi-winner Selection counting independent from Decision majority rules', async () => {
			const organizerUserId = await context.insertOrganizer();
			const meeting = await createDraftMeeting({
				organizerUserId,
				title: 'Valmöte',
				expectedParticipantCount: null
			});
			context.trackMeetings(meeting.id);
			const vote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Välj två ledamöter',
				kind: 'selection',
				positionCount: 2,
				options: ['Ada', 'Bo', 'Cleo']
			});
			if (!vote || vote.kind !== 'selection')
				throw new Error('Expected a Multi-winner Selection Vote');

			await openMeeting({ organizerUserId, meetingId: meeting.id });
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			rememberActiveVote(meeting.publicLocator, vote.id);
			const [ada, bo, cleo] = vote.selection.options;
			if (!ada || !bo || !cleo) throw new Error('Expected three Selection options');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id, bo.id],
				vacancyCount: 0,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id, cleo.id],
				vacancyCount: 0,
				abstain: false
			});

			const closed = await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(closed?.agenda[0]?.outcome?.document).toMatchObject({
				counts: {
					options: [
						{ id: ada.id, count: 2 },
						{ id: bo.id, count: 1 },
						{ id: cleo.id, count: 1 }
					],
					vacancy: 0,
					abstention: 0
				},
				outcome: {
					kind: 'selection',
					state: 'tie',
					winner: null,
					tied: [
						{ id: bo.id, label: 'Bo' },
						{ id: cleo.id, label: 'Cleo' }
					]
				}
			});
		});

		it('publishes multiple Selection winners without exposing option IDs', async () => {
			const { organizerUserId, meeting, vote } = await createActiveSelectionVote({
				positionCount: 2
			});
			const [ada, bo] = vote.selection.options;
			if (!ada || !bo) throw new Error('Expected two Selection options');

			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id, bo.id],
				vacancyCount: 0,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 0,
				abstain: false
			});

			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const projection = await getParticipantProjection(meeting.publicLocator);
			expect(projection).toMatchObject({
				state: 'closed',
				result: {
					revealed: true,
					final: {
						kind: 'selection',
						state: 'winner',
						winner: {
							type: 'options',
							options: [{ label: 'Ada' }, { label: 'Bo' }]
						}
					}
				}
			});
			expect(JSON.stringify(projection)).not.toContain(ada.id);
			expect(JSON.stringify(projection)).not.toContain(bo.id);
		});

		it('lets regular options win an equal Vacancy tie without hiding Abstentions', async () => {
			const organizerUserId = await context.insertOrganizer();
			const meeting = await createDraftMeeting({
				organizerUserId,
				title: 'Valmöte',
				expectedParticipantCount: null
			});
			context.trackMeetings(meeting.id);
			const vote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Välj ordförande',
				kind: 'selection',
				positionCount: 1,
				vacancyEnabled: true,
				options: ['Ada', 'Bo']
			});
			if (!vote || vote.kind !== 'selection') throw new Error('Expected a Selection Vote');
			await openMeeting({ organizerUserId, meetingId: meeting.id });
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			rememberActiveVote(meeting.publicLocator, vote.id);
			const ada = vote.selection.options[0];
			if (!ada) throw new Error('Expected a Selection option');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 0,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [],
				vacancyCount: 1,
				abstain: false
			});
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [],
				vacancyCount: 0,
				abstain: true
			});

			const closed = await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(closed?.agenda[0]?.outcome?.document).toMatchObject({
				counts: { vacancy: 1, abstention: 1 },
				outcome: { state: 'winner', winner: { type: 'option', label: 'Ada' } }
			});
		});
	});

	describe('Incomplete result resolution', () => {
		it('blocks Reveal and Meeting ending until an Incomplete result is accepted', async () => {
			const { organizerUserId, meeting, vote } = await createActiveSelectionVote({
				positionCount: 3,
				options: ['Ada', 'Bo', 'Cleo']
			});
			const [ada] = vote.selection.options;
			if (!ada) throw new Error('Expected a Selection option');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 0,
				abstain: false
			});
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const closed = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			expect(closed?.agenda[0]?.outcome?.document.outcome).toMatchObject({ state: 'incomplete' });
			expect(
				await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			).toBeNull();
			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toBeNull();

			const accepted = await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'accept'
			});
			expect(accepted?.agenda[0]).toMatchObject({ resolution: { type: 'accept' } });
			expect(accepted?.agenda[0]?.outcome?.document.outcome).toMatchObject({ state: 'incomplete' });
			expect(accepted?.outcomeHistory[0]).toMatchObject({
				resolution: { type: 'accept' },
				outcome: { state: 'winner' }
			});
			const changed = await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'vacancy'
			});
			expect(changed?.agenda[0]).toMatchObject({ resolution: { type: 'vacancy' } });

			const revealed = await revealVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			expect(revealed?.agenda[0]).toMatchObject({
				revealed: true,
				resolution: { type: 'vacancy' }
			});
			expect(
				await resolveIncompleteVote({
					organizerUserId,
					meetingId: meeting.id,
					voteId: vote.id,
					resolutionType: 'accept'
				})
			).toBeNull();
		});

		it('marks only unresolved positions as Organizer Vacancy and preserves counts', async () => {
			const { organizerUserId, meeting, vote } = await createActiveSelectionVote({
				positionCount: 3,
				options: ['Ada', 'Bo', 'Cleo']
			});
			const [ada] = vote.selection.options;
			if (!ada) throw new Error('Expected a Selection option');
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [ada.id],
				vacancyCount: 1,
				abstain: false
			});
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const resolved = await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'vacancy'
			});
			const counts = resolved?.agenda[0]?.outcome?.document.counts;
			if (!counts || !('options' in counts)) throw new Error('Expected Selection counts');
			expect(counts.options.find(({ id }) => id === ada.id)).toMatchObject({ count: 1 });
			expect(counts.vacancy).toBe(1);
			expect(counts.abstention).toBe(0);
			expect(resolved?.outcomeHistory[0]).toMatchObject({
				resolution: { type: 'vacancy' },
				outcome: {
					state: 'winner',
					winner: {
						type: 'positions',
						positions: [
							{ type: 'option', id: ada.id, label: 'Ada' },
							{ type: 'vacancy', source: 'participant' },
							{ type: 'vacancy', source: 'organizer' }
						]
					}
				}
			});

			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(await getParticipantProjection(meeting.publicLocator)).toMatchObject({
				result: {
					revealed: true,
					final: {
						state: 'winner',
						winner: {
							type: 'positions',
							positions: [
								{ type: 'option', label: 'Ada' },
								{ type: 'vacancy' },
								{ type: 'vacancy' }
							]
						}
					}
				}
			});
		});

		it('starts a clean Rerun from an unresolved Incomplete result', async () => {
			const { organizerUserId, meeting, vote } = await createIncompleteSelectionVote({
				positionCount: 2
			});
			const originalBeforeRerun = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});

			const rerunMeeting = await rerunVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			const rerun = rerunMeeting?.agenda.find(({ rerunOfVoteId }) => rerunOfVoteId === vote.id);
			if (!rerun) throw new Error('Expected the Incomplete Vote Rerun');
			expect(rerun).toMatchObject({ lifecycle: 'draft', outcome: null, revealed: false });
			expect(originalBeforeRerun?.agenda.find(({ id }) => id === vote.id)).toMatchObject({
				id: vote.id,
				lifecycle: 'closed',
				outcome: { document: { ballotCount: 1, outcome: { state: 'incomplete' } } }
			});
			expect(rerun.rerunOfVoteId).toBe(vote.id);
			expect(
				await context.sql`SELECT count(*)::int AS count FROM ballot WHERE vote_id = ${rerun.id}`
			).toEqual([{ count: 0 }]);
			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toMatchObject({
				lifecycle: 'closed'
			});
		});

		it('accepts an Incomplete result, persists it, reveals it, and allows Meeting ending', async () => {
			const { organizerUserId, meeting, vote } = await createIncompleteSelectionVote();

			const accepted = await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'accept'
			});
			expect(accepted?.agenda[0]?.resolution).toMatchObject({ type: 'accept' });

			const reread = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			const rereadVote = reread?.agenda.find(({ id }) => id === vote.id);
			expect(rereadVote?.resolution).toMatchObject({ type: 'accept' });
			if (!rereadVote?.resolution) throw new Error('Expected a persisted resolution');
			expect(Number.isNaN(Date.parse(rereadVote.resolution.resolvedAt))).toBe(false);

			const revealed = await revealVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			expect(revealed?.agenda[0]).toMatchObject({ revealed: true, resolution: { type: 'accept' } });

			await setPublicResultBreakdown({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				enabled: true
			});
			const participant = await getParticipantProjection(meeting.publicLocator);
			expect(participant).toMatchObject({
				state: 'closed',
				result: {
					revealed: true,
					final: {
						state: 'winner',
						winner: {
							type: 'positions',
							positions: [
								{ type: 'option', label: 'Ada' },
								{ type: 'unresolved' },
								{ type: 'unresolved' }
							]
						}
					},
					breakdown: {
						options: [
							{ label: 'Ada', count: 1 },
							{ label: 'Bo', count: 0 },
							{ label: 'Cleo', count: 0 }
						],
						vacancy: 0,
						abstention: 0
					}
				}
			});
			expect(JSON.stringify(participant)).not.toContain('resolution');

			const presentation = await getPresentationProjection(meeting.publicLocator);
			expect(JSON.stringify(presentation)).not.toContain('resolution');
			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toMatchObject({
				lifecycle: 'closed'
			});
		});

		it('can change a Vacancy resolution back to acceptance before Reveal', async () => {
			const { organizerUserId, meeting, vote } = await createIncompleteSelectionVote({
				vacancyCount: 1
			});

			await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'vacancy'
			});
			const accepted = await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				resolutionType: 'accept'
			});

			expect(accepted?.agenda[0]).toMatchObject({ resolution: { type: 'accept' } });
			expect(accepted?.agenda[0]?.outcome?.document.outcome).toMatchObject({
				state: 'incomplete',
				winner: {
					type: 'positions',
					positions: [
						{ type: 'option', label: 'Ada' },
						{ type: 'vacancy', source: 'participant' },
						{ type: 'unresolved' }
					]
				}
			});
		});

		it('rejects resolution for an unauthorized or non-Incomplete Vote', async () => {
			const { meeting, vote } = await createIncompleteSelectionVote();
			const otherOrganizerUserId = await context.insertOrganizer();

			expect(
				await resolveIncompleteVote({
					organizerUserId: otherOrganizerUserId,
					meetingId: meeting.id,
					voteId: vote.id,
					resolutionType: 'accept'
				})
			).toBeNull();

			const noResult = await createActiveSelectionVote({ positionCount: 2 });
			await closeVote({
				organizerUserId: noResult.organizerUserId,
				meetingId: noResult.meeting.id,
				voteId: noResult.vote.id
			});
			expect(
				await resolveIncompleteVote({
					organizerUserId: noResult.organizerUserId,
					meetingId: noResult.meeting.id,
					voteId: noResult.vote.id,
					resolutionType: 'vacancy'
				})
			).toBeNull();
		});

		it('keeps multiple unresolved Incomplete Votes from ending the Meeting', async () => {
			const organizerUserId = await context.insertOrganizer();
			const meeting = await createDraftMeeting({
				organizerUserId,
				title: 'Valmöte',
				expectedParticipantCount: 12
			});
			context.trackMeetings(meeting.id);
			const firstVote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Första valet',
				kind: 'selection',
				positionCount: 2,
				options: ['Ada', 'Bo']
			});
			const secondVote = await addDraftVote({
				organizerUserId,
				meetingId: meeting.id,
				title: 'Andra valet',
				kind: 'selection',
				positionCount: 2,
				options: ['Cia', 'Dora']
			});
			if (
				!firstVote ||
				!secondVote ||
				firstVote.kind !== 'selection' ||
				secondVote.kind !== 'selection'
			)
				throw new Error('Expected two Selection Votes');

			await openMeeting({ organizerUserId, meetingId: meeting.id });
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: firstVote.id });
			rememberActiveVote(meeting.publicLocator, firstVote.id);
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [firstVote.selection.options[0]?.id ?? ''],
				vacancyCount: 0,
				abstain: false
			});
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: firstVote.id });

			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: secondVote.id });
			rememberActiveVote(meeting.publicLocator, secondVote.id);
			await selectionBallot(meeting.publicLocator, {
				selectedOptionIds: [secondVote.selection.options[0]?.id ?? ''],
				vacancyCount: 0,
				abstain: false
			});
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: secondVote.id });

			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toBeNull();
			await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: firstVote.id,
				resolutionType: 'accept'
			});
			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toBeNull();
			await resolveIncompleteVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: secondVote.id,
				resolutionType: 'vacancy'
			});
			expect(await endMeeting({ organizerUserId, meetingId: meeting.id })).toMatchObject({
				lifecycle: 'closed'
			});
		});
	});

	describe('invalidation and Reruns', () => {
		it('invalidates open and unrevealed Votes, but never a revealed Vote', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			const invalidated = await invalidateVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id,
				reason: 'Fel fråga visades för deltagarna.'
			});

			expect(invalidated?.agenda[0]).toMatchObject({
				lifecycle: 'invalidated',
				invalidationReason: 'Fel fråga visades för deltagarna.'
			});
			expect(
				await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			).toBeNull();

			const second = await rerunVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			if (!second) throw new Error('Expected an invalidated Vote to be rerunnable');
			const rerun = second.agenda.find(({ rerunOfVoteId }) => rerunOfVoteId === vote.id);
			if (!rerun) throw new Error('Expected the Rerun to be linked to its source');
			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: rerun.id });
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: rerun.id });
			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: rerun.id });

			expect(
				await invalidateVote({
					organizerUserId,
					meetingId: meeting.id,
					voteId: rerun.id,
					reason: 'Försök att ogiltigförklara efter visning.'
				})
			).toBeNull();

			const closedSource = await createActiveDecisionVote();
			await closeVote({
				organizerUserId: closedSource.organizerUserId,
				meetingId: closedSource.meeting.id,
				voteId: closedSource.vote.id
			});
			const invalidatedClosed = await invalidateVote({
				organizerUserId: closedSource.organizerUserId,
				meetingId: closedSource.meeting.id,
				voteId: closedSource.vote.id,
				reason: 'Stängningen följde fel ordning.'
			});
			expect(invalidatedClosed?.agenda[0]).toMatchObject({ lifecycle: 'invalidated' });
			expect(invalidatedClosed?.agenda[0]?.outcome?.document.ballotCount).toBe(0);
			expect(
				await revealVote({
					organizerUserId: closedSource.organizerUserId,
					meetingId: closedSource.meeting.id,
					voteId: closedSource.vote.id
				})
			).toBeNull();
		});

		it('does not create a Rerun while another Vote is active', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const created = await rerunVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			if (!created) throw new Error('Expected the first Rerun');
			const rerun = created.agenda.find(({ rerunOfVoteId }) => rerunOfVoteId === vote.id);
			if (!rerun) throw new Error('Expected the Rerun to point to its source');

			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: rerun.id });

			expect(
				await rerunVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			).toBeNull();
			expect(
				(
					await getOrganizerMeetingByLocator({
						organizerUserId,
						publicLocator: meeting.publicLocator
					})
				)?.agenda.filter(({ rerunOfVoteId }) => rerunOfVoteId === vote.id)
			).toHaveLength(1);
		});

		it('rejects Vote invalidation, Reruns, and public breakdown changes after Meeting close', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote();
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			await endMeeting({ organizerUserId, meetingId: meeting.id });

			expect(
				await invalidateVote({
					organizerUserId,
					meetingId: meeting.id,
					voteId: vote.id,
					reason: 'Försök efter mötets slut.'
				})
			).toBeNull();
			expect(
				await rerunVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id })
			).toBeNull();

			await revealVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });
			expect(
				await setPublicResultBreakdown({
					organizerUserId,
					meetingId: meeting.id,
					voteId: vote.id,
					enabled: true
				})
			).toBeNull();
		});

		it('copies Selection configuration into a clean Rerun', async () => {
			const { organizerUserId, meeting, vote } = await createActiveSelectionVote({
				positionCount: 2,
				vacancyEnabled: true,
				options: ['Ada', 'Bo', 'Cleo']
			});
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const rerunMeeting = await rerunVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			if (!rerunMeeting) throw new Error('Expected a Selection Rerun');
			const rerun = rerunMeeting.agenda.find(({ rerunOfVoteId }) => rerunOfVoteId === vote.id);
			if (!rerun || rerun.kind !== 'selection') throw new Error('Expected a Selection Rerun');

			expect(rerun).toMatchObject({
				lifecycle: 'draft',
				revealed: false,
				outcome: null,
				rerunOfVoteId: vote.id,
				selection: {
					mode: 'multiple',
					positionCount: 2,
					vacancyEnabled: true,
					options: [
						{ label: 'Ada', position: 0 },
						{ label: 'Bo', position: 1 },
						{ label: 'Cleo', position: 2 }
					]
				}
			});
			expect(
				await context.sql`SELECT count(*)::int AS count FROM ballot WHERE vote_id = ${rerun.id}`
			).toEqual([{ count: 0 }]);
		});

		it('copies configuration into a clean, chained Rerun and exposes compact history', async () => {
			const { organizerUserId, meeting, vote } = await createActiveDecisionVote({
				majorityRule: 'qualified',
				abstentionsCounted: true
			});
			await decisionBallot(meeting.publicLocator, 'support');
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: vote.id });

			const firstRerunMeeting = await rerunVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: vote.id
			});
			if (!firstRerunMeeting) throw new Error('Expected the first Rerun');
			const firstRerun = firstRerunMeeting.agenda.find(
				({ rerunOfVoteId }) => rerunOfVoteId === vote.id
			);
			if (!firstRerun || firstRerun.kind !== 'decision')
				throw new Error('Expected a Decision Rerun');
			expect(firstRerun).toMatchObject({
				lifecycle: 'draft',
				revealed: false,
				outcome: null,
				decision: { majorityRule: 'qualified', abstentionsCounted: true }
			});
			expect(
				await context.sql`SELECT count(*)::int AS count FROM ballot WHERE vote_id = ${firstRerun.id}`
			).toEqual([{ count: 0 }]);

			await activateVote({ organizerUserId, meetingId: meeting.id, voteId: firstRerun.id });
			await closeVote({ organizerUserId, meetingId: meeting.id, voteId: firstRerun.id });
			const secondRerunMeeting = await rerunVote({
				organizerUserId,
				meetingId: meeting.id,
				voteId: firstRerun.id
			});
			if (!secondRerunMeeting) throw new Error('Expected a chained Rerun');
			const secondRerun = secondRerunMeeting.agenda.find(
				({ rerunOfVoteId }) => rerunOfVoteId === firstRerun.id
			);
			if (!secondRerun) throw new Error('Expected the second Rerun to point to the first');

			const organizer = await getOrganizerMeetingByLocator({
				organizerUserId,
				publicLocator: meeting.publicLocator
			});
			expect(organizer?.outcomeHistory).toEqual([
				expect.objectContaining({
					voteId: firstRerun.id,
					majorityRule: 'qualified',
					abstentionsCounted: true,
					rerunOfVoteId: vote.id,
					rerunVoteIds: [secondRerun.id]
				}),
				expect.objectContaining({
					voteId: vote.id,
					rerunVoteIds: [firstRerun.id]
				})
			]);
		});
	});
});
