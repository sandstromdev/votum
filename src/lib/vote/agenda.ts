import type { IncompleteResolution, OutcomeSnapshot } from './outcome.js';
import type { DecisionMajorityConfiguration } from './majority.js';

export const DEFAULT_VACANCY_ENABLED = true;

export const VOTE_KINDS = ['decision', 'selection'] as const;
export type VoteKind = (typeof VOTE_KINDS)[number];

export const VOTE_LIFECYCLES = ['draft', 'open', 'closed', 'invalidated'] as const;
export type VoteLifecycle = (typeof VOTE_LIFECYCLES)[number];

export const SELECTION_VOTE_MODES = ['single', 'multiple'] as const;
export type SelectionVoteMode = (typeof SELECTION_VOTE_MODES)[number];

type OrganizerVoteBase = {
	id: string;
	meetingId: string;
	position: number;
	title: string;
	lifecycle: VoteLifecycle;
	openedAt: Date | null;
	closedAt: Date | null;
	rerunOfVoteId: string | null;
	invalidationReason: string | null;
	invalidatedAt: Date | null;
	resolution?: IncompleteResolution | null;
	revealed?: boolean;
	revealedAt?: Date | null;
	publicResultBreakdownEnabled?: boolean;
	outcome?: OutcomeSnapshot | null;
};

export type OrganizerVote =
	| (OrganizerVoteBase & {
			kind: 'decision';
			decision: {
				supportLabel: string;
				opposeLabel: string;
				abstentionLabel: string;
			} & DecisionMajorityConfiguration;
	  })
	| (OrganizerVoteBase & {
			kind: 'selection';
			selection: {
				mode: SelectionVoteMode;
				positionCount: number;
				vacancyEnabled: boolean;
				options: Array<{ id: string; label: string; position: number }>;
			};
	  });

export function compareVotesByOpenedAt(
	left: Pick<OrganizerVote, 'openedAt' | 'position'>,
	right: Pick<OrganizerVote, 'openedAt' | 'position'>
) {
	const leftTime = left.openedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
	const rightTime = right.openedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
	return leftTime - rightTime || left.position - right.position;
}
