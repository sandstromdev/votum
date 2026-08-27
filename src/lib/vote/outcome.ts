import type { DecisionBallotChoice } from './ballot.js';
import type { SelectionVoteMode } from './agenda.js';
import type { DecisionMajorityConfiguration } from './majority.js';

export const OUTCOME_SNAPSHOT_VERSION = 2;

export const INCOMPLETE_RESOLUTION_TYPES = ['accept', 'vacancy'] as const;
export type IncompleteResolutionType = (typeof INCOMPLETE_RESOLUTION_TYPES)[number];

export type IncompleteResolution = {
	type: IncompleteResolutionType;
	resolvedAt: string;
};

export type SelectionSnapshotOption = {
	id: string;
	label: string;
	position: number;
};

export type OutcomeSnapshotVote =
	| {
			kind: 'decision';
			title: string;
			decision: {
				supportLabel: string;
				opposeLabel: string;
				abstentionLabel: string;
			} & DecisionMajorityConfiguration;
	  }
	| {
			kind: 'selection';
			title: string;
			selection: {
				mode: SelectionVoteMode;
				positionCount: number;
				vacancyEnabled: boolean;
				options: SelectionSnapshotOption[];
			};
	  };

export type DecisionCounts = {
	support: number;
	oppose: number;
	abstention: number;
};

export type SelectionCounts = {
	options: Array<SelectionSnapshotOption & { count: number }>;
	vacancy: number;
	abstention: number;
};

export type SelectionWinner =
	| { type: 'option'; id: string; label: string }
	| { type: 'vacancy' }
	| { type: 'options'; options: Array<{ id: string; label: string }> }
	| {
			type: 'positions';
			positions: Array<
				| { type: 'option'; id: string; label: string }
				| { type: 'vacancy'; source: 'participant' | 'organizer' }
				| { type: 'unresolved' }
			>;
	  };

export type DecisionOutcome =
	| { state: 'winner'; winner: DecisionBallotChoice }
	| { state: 'tie'; winner: null; tied: DecisionBallotChoice[] }
	| { state: 'rejected'; winner: null }
	| { state: 'no-result'; winner: null };

export type SelectionOutcome =
	| { state: 'winner'; winner: SelectionWinner }
	| { state: 'tie'; winner: null; tied: Array<{ id: string; label: string }> }
	| { state: 'incomplete'; winner: Extract<SelectionWinner, { type: 'positions' }> }
	| { state: 'no-result'; winner: null };

type OutcomeLabelInput =
	| {
			kind: 'decision';
			state: DecisionOutcome['state'];
			winner: DecisionBallotChoice | null;
	  }
	| {
			kind: 'selection';
			state: SelectionOutcome['state'];
			winner:
				| { type: 'option'; label: string }
				| { type: 'vacancy' }
				| { type: 'options'; options: Array<{ label: string }> }
				| {
						type: 'positions';
						positions: Array<
							{ type: 'option'; label: string } | { type: 'vacancy' } | { type: 'unresolved' }
						>;
				  }
				| null;
	  };

export function applyIncompleteResolution(
	outcome: SelectionOutcome,
	resolution: IncompleteResolution | null | undefined
): SelectionOutcome {
	if (outcome.state !== 'incomplete' || !resolution) {
		return outcome;
	}

	return {
		state: 'winner',
		winner: {
			type: 'positions',
			positions: outcome.winner.positions.map((position) => {
				if (position.type === 'unresolved' && resolution.type === 'vacancy') {
					return { type: 'vacancy', source: 'organizer' };
				}

				return position;
			})
		}
	};
}

export function outcomeLabel(outcome: OutcomeLabelInput) {
	if (outcome.kind === 'decision') {
		if (outcome.state === 'tie') {
			return 'Oavgjort';
		}
		if (outcome.state === 'no-result') {
			return 'Inget resultat';
		}
		if (outcome.state === 'rejected') {
			return 'Förslaget gick inte igenom';
		}

		return 'Förslaget gick igenom';
	}

	if (outcome.state === 'tie') {
		return 'Oavgjort';
	}
	if (outcome.state === 'no-result' || !outcome.winner) {
		return 'Inget resultat';
	}
	if (outcome.winner.type === 'vacancy') {
		return 'Vakans';
	}
	if (outcome.winner.type === 'option') {
		return outcome.winner.label;
	}
	if (outcome.winner.type === 'options') {
		return outcome.winner.options.map(({ label }) => label).join(', ');
	}

	const unresolved = outcome.winner.positions.filter(({ type }) => type === 'unresolved').length;
	const vacancyCount = outcome.winner.positions.filter(
		(position) => position.type === 'vacancy'
	).length;
	const labels = outcome.winner.positions
		.filter((position): position is { type: 'option'; label: string } => position.type === 'option')
		.map(({ label }) => label);

	if (vacancyCount > 0) {
		labels.push(`${vacancyCount} ${vacancyCount === 1 ? 'vakant plats' : 'vakanta platser'}`);
	}
	if (unresolved > 0) {
		labels.push(`${unresolved} ${unresolved === 1 ? 'plats ej tillsatt' : 'platser ej tillsatta'}`);
	}

	return labels.join(' + ');
}

type OutcomeSnapshotDocumentBase = {
	closedAt: string;
	expectedParticipantCount: number | null;
	ballotCount: number;
};

export type OutcomeSnapshotDocument =
	| (OutcomeSnapshotDocumentBase & {
			version: typeof OUTCOME_SNAPSHOT_VERSION;
			vote: Extract<OutcomeSnapshotVote, { kind: 'decision' }>;
			counts: DecisionCounts;
			outcome: { kind: 'decision' } & DecisionOutcome;
	  })
	| (OutcomeSnapshotDocumentBase & {
			version: typeof OUTCOME_SNAPSHOT_VERSION;
			vote: Extract<OutcomeSnapshotVote, { kind: 'selection' }>;
			counts: SelectionCounts;
			outcome: { kind: 'selection' } & SelectionOutcome;
	  });

export type OutcomeSnapshot = {
	voteId: string;
	meetingId: string;
	document: OutcomeSnapshotDocument;
	createdAt: Date;
};

export type PublicOutcome =
	| {
			kind: 'decision';
			state: DecisionOutcome['state'];
			winner: DecisionBallotChoice | null;
			majorityLabel?: string;
			abstentionsCounted?: boolean;
			breakdown?: DecisionCounts;
	  }
	| {
			kind: 'selection';
			state: SelectionOutcome['state'];
			winner:
				| { type: 'option'; label: string }
				| { type: 'vacancy' }
				| { type: 'options'; options: Array<{ label: string }> }
				| {
						type: 'positions';
						positions: Array<
							{ type: 'option'; label: string } | { type: 'vacancy' } | { type: 'unresolved' }
						>;
				  }
				| null;
			breakdown?: {
				options: Array<{ label: string; count: number }>;
				vacancy: number;
				abstention: number;
			};
	  };

export type PublicVoteResult =
	| { revealed: false }
	| { revealed: true; final: PublicOutcome; breakdown?: PublicOutcome['breakdown'] };

type OutcomeHistoryEntryBase = {
	voteId: string;
	title: string;
	ballotCount: number;
	expectedParticipantCount: number | null;
	closedAt: string;
	revealed: boolean;
	invalidated: boolean;
	rerunOfVoteId: string | null;
	rerunVoteIds: string[];
	resolution?: IncompleteResolution | null;
};

export type OutcomeHistoryEntry =
	| (OutcomeHistoryEntryBase & {
			kind: 'decision';
			outcome: { kind: 'decision' } & DecisionOutcome;
			counts: DecisionCounts;
			majorityRule?: DecisionMajorityConfiguration['majorityRule'];
			abstentionsCounted?: boolean;
	  })
	| (OutcomeHistoryEntryBase & {
			kind: 'selection';
			outcome: { kind: 'selection' } & SelectionOutcome;
			counts: SelectionCounts;
	  });
