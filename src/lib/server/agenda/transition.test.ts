import { describe, expect, it } from 'vitest';
import { decideDraftReorder, nextAgendaPosition } from './transition.js';

describe('agenda transitions', () => {
	it('finds the next position after empty and gapped agendas', () => {
		expect(nextAgendaPosition([])).toBe(0);
		expect(nextAgendaPosition([{ position: 0 }, { position: 4 }])).toBe(5);
	});

	it('rejects duplicate, missing, and non-draft Vote IDs', () => {
		const rows = [
			{ id: 'draft-1', position: 0, lifecycle: 'draft' },
			{ id: 'open-1', position: 1, lifecycle: 'open' },
			{ id: 'draft-2', position: 2, lifecycle: 'draft' }
		] satisfies Parameters<typeof decideDraftReorder>[0];

		expect(decideDraftReorder(rows, ['draft-1', 'draft-1'])).toEqual({ kind: 'invalid' });
		expect(decideDraftReorder(rows, ['draft-1'])).toEqual({ kind: 'invalid' });
		expect(decideDraftReorder(rows, ['draft-1', 'open-1'])).toEqual({ kind: 'invalid' });
	});

	it('distinguishes unchanged order from a changed order', () => {
		const rows = [
			{ id: 'draft-1', position: 0, lifecycle: 'draft' },
			{ id: 'open-1', position: 1, lifecycle: 'open' },
			{ id: 'draft-2', position: 2, lifecycle: 'draft' }
		] satisfies Parameters<typeof decideDraftReorder>[0];

		expect(decideDraftReorder(rows, ['draft-1', 'draft-2'])).toEqual({ kind: 'unchanged' });
		expect(decideDraftReorder(rows, ['draft-2', 'draft-1'])).toMatchObject({
			kind: 'changed',
			draftRows: [rows[0], rows[2]],
			temporaryOffset: 6
		});
	});
});
