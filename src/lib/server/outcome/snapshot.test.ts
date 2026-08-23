import { describe, expect, it } from 'vitest';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import { outcomeLabel } from '#lib/vote/outcome.js';
import { buildOutcomeSnapshotDocument } from './snapshot.js';

const baseVote: Extract<OrganizerVote, { kind: 'decision' }> = {
	id: '018f3c4b-7d2e-7abc-8def-123456789abc',
	meetingId: '018f3c4b-7d2e-7abc-8def-123456789abd',
	position: 0,
	title: 'Godkänn budgeten',
	lifecycle: 'open',
	openedAt: new Date('2026-08-20T10:00:00.000Z'),
	closedAt: null,
	rerunOfVoteId: null,
	invalidationReason: null,
	invalidatedAt: null,
	kind: 'decision',
	decision: {
		supportLabel: 'För',
		opposeLabel: 'Emot',
		abstentionLabel: 'Avstår',
		majorityRule: 'simple',
		abstentionsCounted: false
	}
};

const selectionVote: Extract<OrganizerVote, { kind: 'selection' }> = {
	id: '018f3c4b-7d2e-7abc-8def-123456789abc',
	meetingId: '018f3c4b-7d2e-7abc-8def-123456789abd',
	position: 0,
	title: 'Välj ordförande',
	lifecycle: 'open',
	openedAt: new Date('2026-08-20T10:00:00.000Z'),
	closedAt: null,
	rerunOfVoteId: null,
	invalidationReason: null,
	invalidatedAt: null,
	kind: 'selection',
	selection: {
		mode: 'single',
		positionCount: 1,
		vacancyEnabled: true,
		options: [
			{ id: '0193e0a0-0000-7000-8000-000000000010', label: 'Ada', position: 0 },
			{ id: '0193e0a0-0000-7000-8000-000000000011', label: 'Bo', position: 1 }
		]
	}
};

const multiSelectionVote: Extract<OrganizerVote, { kind: 'selection' }> = {
	...selectionVote,
	selection: {
		...selectionVote.selection,
		mode: 'multiple',
		positionCount: 2,
		options: [
			...selectionVote.selection.options,
			{ id: '0193e0a0-0000-7000-8000-000000000012', label: 'Cia', position: 2 }
		]
	}
};

const singleSelectionWithoutVacancy: Extract<OrganizerVote, { kind: 'selection' }> = {
	...selectionVote,
	selection: { ...selectionVote.selection, vacancyEnabled: false }
};

const multiSelectionWithoutVacancy: Extract<OrganizerVote, { kind: 'selection' }> = {
	...multiSelectionVote,
	selection: { ...multiSelectionVote.selection, vacancyEnabled: false }
};

function snapshot(
	choices: Array<'support' | 'oppose' | 'abstention'>,
	decision = baseVote.decision
) {
	return buildOutcomeSnapshotDocument({
		vote: { ...baseVote, decision },
		ballots: choices.map((choice) => ({ type: 'decision', choice })),
		expectedParticipantCount: 12,
		closedAt: new Date('2026-08-20T11:00:00.000Z')
	});
}

function selectionSnapshot(
	ballots: Array<{
		selectedOptionIds: string[];
		vacancyCount: number;
		abstain: boolean;
	}>,
	vote: Extract<OrganizerVote, { kind: 'selection' }> = selectionVote
) {
	return buildOutcomeSnapshotDocument({
		vote,
		ballots: ballots.map((ballot) => ({ type: 'selection', ...ballot })),
		expectedParticipantCount: 12,
		closedAt: new Date('2026-08-20T11:00:00.000Z')
	});
}

describe('Decision Vote outcome snapshots', () => {
	it('passes a Simple majority when Support exceeds Oppose', () => {
		expect(snapshot(['support', 'support', 'oppose']).outcome).toEqual({
			kind: 'decision',
			state: 'winner',
			winner: 'support'
		});
	});

	it('rejects a Simple-majority proposal when Support does not lead', () => {
		expect(snapshot(['support', 'oppose', 'oppose']).outcome).toEqual({
			kind: 'decision',
			state: 'rejected',
			winner: null
		});
	});

	it('keeps a Support and Oppose tie unresolved', () => {
		expect(snapshot(['support', 'oppose']).outcome).toEqual({
			kind: 'decision',
			state: 'tie',
			winner: null,
			tied: ['support', 'oppose']
		});
	});

	it('returns no result for no Ballots or Abstention-only Ballots', () => {
		expect(snapshot([]).outcome).toEqual({ kind: 'decision', state: 'no-result', winner: null });
		expect(snapshot(['abstention', 'abstention']).outcome).toEqual({
			kind: 'decision',
			state: 'no-result',
			winner: null
		});
	});

	it('passes Qualified majority at exactly two-thirds', () => {
		expect(
			snapshot(['support', 'support', 'oppose'], {
				...baseVote.decision,
				majorityRule: 'qualified',
				abstentionsCounted: false
			}).outcome
		).toEqual({ kind: 'decision', state: 'winner', winner: 'support' });
	});

	it('rejects Qualified majority just below two-thirds', () => {
		expect(
			snapshot(['support', 'support', 'support', 'oppose', 'oppose'], {
				...baseVote.decision,
				majorityRule: 'qualified',
				abstentionsCounted: false
			}).outcome
		).toEqual({ kind: 'decision', state: 'rejected', winner: null });
	});

	it('uses the configured Qualified-majority Abstention denominator', () => {
		const excluded = snapshot(['support', 'support', 'oppose', 'abstention'], {
			...baseVote.decision,
			majorityRule: 'qualified',
			abstentionsCounted: false
		});
		const included = snapshot(['support', 'support', 'oppose', 'abstention'], {
			...baseVote.decision,
			majorityRule: 'qualified',
			abstentionsCounted: true
		});

		expect(excluded.outcome).toEqual({ kind: 'decision', state: 'winner', winner: 'support' });
		expect(included.outcome).toEqual({ kind: 'decision', state: 'rejected', winner: null });
	});

	it('stores the effective majority configuration in the immutable document', () => {
		const document = snapshot(['support'], {
			...baseVote.decision,
			majorityRule: 'qualified',
			abstentionsCounted: true
		});

		expect(document.version).toBe(2);
		expect(document.vote).toMatchObject({
			decision: { majorityRule: 'qualified', abstentionsCounted: true }
		});
		expect(document.counts).toEqual({ support: 1, oppose: 0, abstention: 0 });
	});
});

describe('Selection Vote outcome snapshots', () => {
	it('chooses a regular option for a Single-winner Selection without Vacancy', () => {
		const ada = selectionVote.selection.options[0];
		if (!ada) throw new Error('Expected a Selection option');

		expect(
			selectionSnapshot(
				[
					{
						selectedOptionIds: [ada.id],
						vacancyCount: 0,
						abstain: false
					}
				],
				singleSelectionWithoutVacancy
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'option',
				id: '0193e0a0-0000-7000-8000-000000000010',
				label: 'Ada'
			}
		});
	});

	it('lets a regular option win an equal Vacancy tie for a Single-winner Selection', () => {
		const ada = selectionVote.selection.options[0];
		if (!ada) throw new Error('Expected a Selection option');

		expect(
			selectionSnapshot([
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [], vacancyCount: 1, abstain: false }
			]).outcome
		).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: { type: 'option', id: ada.id, label: ada.label }
		});
	});

	it('returns no result for an empty Single-winner Selection with Vacancy enabled', () => {
		expect(selectionSnapshot([]).outcome).toEqual({
			kind: 'selection',
			state: 'no-result',
			winner: null
		});
	});

	it('keeps a regular-option tie unresolved', () => {
		expect(
			selectionSnapshot(
				[
					{
						selectedOptionIds: ['0193e0a0-0000-7000-8000-000000000010'],
						vacancyCount: 0,
						abstain: false
					},
					{
						selectedOptionIds: ['0193e0a0-0000-7000-8000-000000000011'],
						vacancyCount: 0,
						abstain: false
					}
				],
				singleSelectionWithoutVacancy
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'tie',
			winner: null,
			tied: [
				{ id: '0193e0a0-0000-7000-8000-000000000010', label: 'Ada' },
				{ id: '0193e0a0-0000-7000-8000-000000000011', label: 'Bo' }
			]
		});
	});

	it('records Vacancy as the winner when it has more support than a regular option', () => {
		expect(
			selectionSnapshot([
				{ selectedOptionIds: [], vacancyCount: 1, abstain: false },
				{ selectedOptionIds: [], vacancyCount: 1, abstain: false },
				{
					selectedOptionIds: ['0193e0a0-0000-7000-8000-000000000010'],
					vacancyCount: 0,
					abstain: false
				}
			]).outcome
		).toEqual({ kind: 'selection', state: 'winner', winner: { type: 'vacancy' } });
	});

	it('returns no result when every Selection Ballot is Abstention', () => {
		expect(
			selectionSnapshot(
				[{ selectedOptionIds: [], vacancyCount: 0, abstain: true }],
				singleSelectionWithoutVacancy
			).outcome
		).toEqual({ kind: 'selection', state: 'no-result', winner: null });
	});

	it('returns the supported options for a Multi-winner Selection', () => {
		const [ada, bo] = multiSelectionVote.selection.options;
		if (!ada || !bo) throw new Error('Expected two Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id, bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false }
				],
				multiSelectionWithoutVacancy
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'options',
				options: [
					{ id: ada.id, label: ada.label },
					{ id: bo.id, label: bo.label }
				]
			}
		});
	});

	it('returns supported options for a Multi-winner Selection with Vacancy below the cutoff', () => {
		const [ada, bo] = multiSelectionVote.selection.options;
		if (!ada || !bo) throw new Error('Expected two Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id, bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [], vacancyCount: 1, abstain: false }
				],
				multiSelectionVote
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'options',
				options: [
					{ id: ada.id, label: ada.label },
					{ id: bo.id, label: bo.label }
				]
			}
		});
	});

	it('returns no result for an empty Multi-winner Selection without Vacancy', () => {
		expect(selectionSnapshot([], multiSelectionWithoutVacancy).outcome).toEqual({
			kind: 'selection',
			state: 'no-result',
			winner: null
		});
	});

	it('records Vacancy as the winner for an otherwise empty Multi-winner Selection', () => {
		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [], vacancyCount: 2, abstain: false },
					{ selectedOptionIds: [], vacancyCount: 2, abstain: false }
				],
				multiSelectionVote
			).outcome
		).toEqual({ kind: 'selection', state: 'winner', winner: { type: 'vacancy' } });
	});

	it('keeps explicit Vacancy separate from an unresolved position', () => {
		const result = selectionSnapshot(
			[{ selectedOptionIds: [], vacancyCount: 1, abstain: false }],
			multiSelectionVote
		);

		expect(result.outcome).toEqual({
			kind: 'selection',
			state: 'incomplete',
			winner: {
				type: 'positions',
				positions: [{ type: 'vacancy', source: 'participant' }, { type: 'unresolved' }]
			}
		});
	});

	it('returns a regular option, explicit Vacancy, and unresolved positions by position', () => {
		const [ada, bo, cia] = multiSelectionVote.selection.options;
		if (!ada || !bo || !cia) throw new Error('Expected three Selection options');

		const result = selectionSnapshot(
			[
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [], vacancyCount: 0, abstain: false }
			],
			{ ...multiSelectionVote, selection: { ...multiSelectionVote.selection, positionCount: 3 } }
		);

		expect(result.outcome).toEqual({
			kind: 'selection',
			state: 'incomplete',
			winner: {
				type: 'positions',
				positions: [
					{ type: 'option', id: ada.id, label: ada.label },
					{ type: 'unresolved' },
					{ type: 'unresolved' }
				]
			}
		});
		expect(outcomeLabel(result.outcome)).toBe('Ada + 2 platser ej tillsatta');
	});

	it('lets Vacancy fill every Multi-winner position when its support is higher', () => {
		const [ada, bo] = multiSelectionVote.selection.options;
		if (!ada || !bo) throw new Error('Expected two Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [], vacancyCount: 10, abstain: false }
				],
				multiSelectionVote
			).outcome
		).toEqual({ kind: 'selection', state: 'winner', winner: { type: 'vacancy' } });
	});

	it('keeps a Multi-winner cutoff tie unresolved', () => {
		const [ada, bo, cia] = multiSelectionVote.selection.options;
		if (!ada || !bo || !cia) throw new Error('Expected three Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [cia.id], vacancyCount: 0, abstain: false }
				],
				multiSelectionWithoutVacancy
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'tie',
			winner: null,
			tied: [
				{ id: ada.id, label: ada.label },
				{ id: bo.id, label: bo.label },
				{ id: cia.id, label: cia.label }
			]
		});
	});

	it('lets Vacancy beat a regular tie when it has more support than the cutoff', () => {
		const [ada, bo, cia] = multiSelectionVote.selection.options;
		if (!ada || !bo || !cia) throw new Error('Expected three Selection options');

		const result = selectionSnapshot(
			[
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [cia.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [], vacancyCount: 2, abstain: false }
			],
			multiSelectionVote
		);

		expect(result.counts).toMatchObject({
			options: [
				{ id: ada.id, count: 2 },
				{ id: bo.id, count: 1 },
				{ id: cia.id, count: 1 }
			],
			vacancy: 2,
			abstention: 0
		});
		expect(result.outcome).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'positions',
				positions: [
					{ type: 'option', id: ada.id, label: ada.label },
					{ type: 'vacancy', source: 'participant' }
				]
			}
		});
	});

	it('lets regular options win equal Vacancy support at the Multi-winner cutoff', () => {
		const [ada, bo] = multiSelectionVote.selection.options;
		if (!ada || !bo) throw new Error('Expected two Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [], vacancyCount: 2, abstain: false }
				],
				multiSelectionVote
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'options',
				options: [
					{ id: ada.id, label: ada.label },
					{ id: bo.id, label: bo.label }
				]
			}
		});
	});

	it('keeps a Multi-winner tie unresolved when more regular options share the cutoff than positions', () => {
		const [ada, bo, cia] = multiSelectionVote.selection.options;
		if (!ada || !bo || !cia) throw new Error('Expected three Selection options');

		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [cia.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [cia.id], vacancyCount: 0, abstain: false },
					{ selectedOptionIds: [], vacancyCount: 2, abstain: false }
				],
				multiSelectionVote
			).outcome
		).toEqual({
			kind: 'selection',
			state: 'tie',
			winner: null,
			tied: [
				{ id: ada.id, label: ada.label },
				{ id: bo.id, label: bo.label },
				{ id: cia.id, label: cia.label }
			]
		});
	});

	it('fills a remaining Multi-winner position with Vacancy after regular options win equal support', () => {
		const [ada, bo] = multiSelectionVote.selection.options;
		if (!ada || !bo) throw new Error('Expected two Selection options');

		const result = selectionSnapshot(
			[
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [ada.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [bo.id], vacancyCount: 0, abstain: false },
				{ selectedOptionIds: [], vacancyCount: 2, abstain: false }
			],
			{ ...multiSelectionVote, selection: { ...multiSelectionVote.selection, positionCount: 3 } }
		);

		expect(result.outcome).toEqual({
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'positions',
				positions: [
					{ type: 'option', id: ada.id, label: ada.label },
					{ type: 'option', id: bo.id, label: bo.label },
					{ type: 'vacancy', source: 'participant' }
				]
			}
		});
	});

	it('returns no result for an empty Multi-winner Selection with Vacancy enabled', () => {
		expect(selectionSnapshot([], multiSelectionVote).outcome).toEqual({
			kind: 'selection',
			state: 'no-result',
			winner: null
		});
	});

	it('returns no result for Abstention-only Multi-winner Ballots', () => {
		expect(
			selectionSnapshot(
				[
					{ selectedOptionIds: [], vacancyCount: 0, abstain: true },
					{ selectedOptionIds: [], vacancyCount: 0, abstain: true }
				],
				multiSelectionVote
			).outcome
		).toEqual({ kind: 'selection', state: 'no-result', winner: null });
	});
});
