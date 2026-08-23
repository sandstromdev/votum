import { describe, expect, it } from 'vitest';
import { applyIncompleteResolution, outcomeLabel } from './outcome.js';

describe('outcome labels', () => {
	it('labels a Selection tie as unresolved', () => {
		expect(
			outcomeLabel({
				kind: 'selection',
				state: 'tie',
				winner: null
			})
		).toBe('Oavgjort');
	});

	it('keeps Vacancy, abstention-only, and winner results distinct', () => {
		expect(outcomeLabel({ kind: 'selection', state: 'winner', winner: { type: 'vacancy' } })).toBe(
			'Vakans'
		);
		expect(outcomeLabel({ kind: 'selection', state: 'no-result', winner: null })).toBe(
			'Inget resultat'
		);
		expect(
			outcomeLabel({ kind: 'selection', state: 'winner', winner: { type: 'option', label: 'Ada' } })
		).toBe('Ada');
	});

	it('keeps unresolved positions when an Incomplete result is accepted', () => {
		const outcome = {
			kind: 'selection' as const,
			state: 'incomplete' as const,
			winner: {
				type: 'positions' as const,
				positions: [
					{ type: 'option' as const, id: 'ada', label: 'Ada' },
					{ type: 'unresolved' as const },
					{ type: 'unresolved' as const }
				]
			}
		};

		expect(
			applyIncompleteResolution(outcome, {
				type: 'accept',
				resolvedAt: '2026-08-23T10:00:00.000Z'
			})
		).toEqual({
			state: 'winner',
			winner: {
				type: 'positions',
				positions: [
					{ type: 'option', id: 'ada', label: 'Ada' },
					{ type: 'unresolved' },
					{ type: 'unresolved' }
				]
			}
		});
	});

	it('converts only unresolved positions to Organizer Vacancy', () => {
		const outcome = {
			kind: 'selection' as const,
			state: 'incomplete' as const,
			winner: {
				type: 'positions' as const,
				positions: [
					{ type: 'option' as const, id: 'ada', label: 'Ada' },
					{ type: 'vacancy' as const, source: 'participant' as const },
					{ type: 'unresolved' as const }
				]
			}
		};

		expect(
			applyIncompleteResolution(outcome, {
				type: 'vacancy',
				resolvedAt: '2026-08-23T10:00:00.000Z'
			})
		).toEqual({
			state: 'winner',
			winner: {
				type: 'positions',
				positions: [
					{ type: 'option', id: 'ada', label: 'Ada' },
					{ type: 'vacancy', source: 'participant' },
					{ type: 'vacancy', source: 'organizer' }
				]
			}
		});
	});

	it('labels mixed, singular, and plural position results', () => {
		expect(
			outcomeLabel({
				kind: 'selection',
				state: 'winner',
				winner: {
					type: 'positions',
					positions: [{ type: 'option', label: 'Ada' }, { type: 'vacancy' }, { type: 'unresolved' }]
				}
			})
		).toBe('Ada + 1 vakant plats + 1 plats ej tillsatt');
		expect(
			outcomeLabel({
				kind: 'selection',
				state: 'winner',
				winner: {
					type: 'positions',
					positions: [{ type: 'vacancy' }, { type: 'vacancy' }]
				}
			})
		).toBe('2 vakanta platser');
		expect(
			outcomeLabel({
				kind: 'selection',
				state: 'winner',
				winner: {
					type: 'positions',
					positions: [{ type: 'unresolved' }]
				}
			})
		).toBe('1 plats ej tillsatt');
	});
});
