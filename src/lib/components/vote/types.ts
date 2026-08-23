import type { ParticipantPageProjection } from '#lib/vote/meeting.js';
import type { SvelteSet } from 'svelte/reactivity';

export type UpdateSelection =
	| {
			type: 'vacant';
			count: number;
	  }
	| {
			type: 'abstain';
			abstain: boolean;
	  }
	| {
			type: 'add' | 'remove' | 'set';
			optionId: string;
	  };

export type SelectionVote = Extract<
	Extract<ParticipantPageProjection, { state: 'active' }>['vote'],
	{ kind: 'selection' }
>;

export type DecisionVote = Extract<
	Extract<ParticipantPageProjection, { state: 'active' }>['vote'],
	{ kind: 'decision' }
>;

export type Option = {
	value: string;
	label: string;
};

export type SelectionProps = {
	selected: SvelteSet<string>;
	vacancyCount: number;
	abstain: boolean;
	onSelect: (update: UpdateSelection) => void;
	selection: SelectionVote['selection'];
};

export type ParticipantBallot = Extract<
	ParticipantPageProjection,
	{ state: 'active' }
>['currentBallot'];

export type ParticipantDecisionBallot = Extract<ParticipantBallot, { type: 'decision' }>;
export type ParticipantSelectionBallot = Extract<ParticipantBallot, { type: 'selection' }>;
