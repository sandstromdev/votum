import type { VoteLifecycle } from '#lib/vote/agenda.js';

type AgendaRow = {
	id: string;
	position: number;
	lifecycle: VoteLifecycle;
};

export function nextAgendaPosition(rows: Pick<AgendaRow, 'position'>[]) {
	return Math.max(...rows.map(({ position }) => position), -1) + 1;
}

export type ReorderDecision =
	| { kind: 'invalid' }
	| { kind: 'unchanged' }
	| {
			kind: 'changed';
			draftRows: AgendaRow[];
			temporaryOffset: number;
	  };

export function decideDraftReorder(rows: AgendaRow[], orderedVoteIds: string[]): ReorderDecision {
	const draftRows = rows.filter((row) => row.lifecycle === 'draft');
	const draftIds = draftRows.map(({ id }) => id);
	if (
		orderedVoteIds.length !== draftIds.length ||
		new Set(orderedVoteIds).size !== orderedVoteIds.length ||
		orderedVoteIds.some((id) => !draftIds.includes(id))
	) {
		return { kind: 'invalid' };
	}

	if (orderedVoteIds.every((voteId, index) => voteId === draftIds[index])) {
		return { kind: 'unchanged' };
	}

	return {
		kind: 'changed',
		draftRows,
		temporaryOffset: rows.length + Math.max(...rows.map(({ position }) => position), 0) + 1
	};
}
