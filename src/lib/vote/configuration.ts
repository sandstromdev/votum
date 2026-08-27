import type { DraftVoteInput } from '#lib/schemas/vote.js';
import { DEFAULT_VACANCY_ENABLED, type OrganizerVote, type SelectionVoteMode } from './agenda.js';
import {
	DEFAULT_ABSTENTIONS_COUNTED,
	DEFAULT_MAJORITY_RULE,
	type DecisionMajorityConfiguration
} from './majority.js';

export type VoteConfiguration =
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
				optionLabels: string[];
			};
	  };

export function selectionModeFromPositionCount(positionCount: number): SelectionVoteMode {
	return positionCount > 1 ? 'multiple' : 'single';
}

export function organizerVoteToDraftFields(vote?: OrganizerVote) {
	const decision = vote?.kind === 'decision' ? vote.decision : undefined;
	const selection = vote?.kind === 'selection' ? vote.selection : undefined;

	return {
		title: vote?.title ?? '',
		kind: vote?.kind ?? 'decision',
		supportLabel: decision?.supportLabel ?? 'För',
		opposeLabel: decision?.opposeLabel ?? 'Emot',
		abstentionLabel: decision?.abstentionLabel ?? 'Avstå',
		majorityRule: decision?.majorityRule ?? DEFAULT_MAJORITY_RULE,
		abstentionsCounted: decision?.abstentionsCounted ?? DEFAULT_ABSTENTIONS_COUNTED,
		positionCount: selection?.positionCount ?? 1,
		vacancyEnabled: selection?.vacancyEnabled ?? DEFAULT_VACANCY_ENABLED,
		options: selection?.options.map((option) => option.label) ?? []
	};
}

export function draftInputToVoteConfiguration(parsed: DraftVoteInput): VoteConfiguration {
	if (parsed.kind === 'decision') {
		const { supportLabel, opposeLabel, abstentionLabel } = parsed;

		if (!supportLabel || !opposeLabel || !abstentionLabel) {
			throw new Error('Decision Vote is missing a required label.');
		}

		return {
			kind: 'decision',
			title: parsed.title,
			decision: {
				supportLabel,
				opposeLabel,
				abstentionLabel,
				majorityRule: parsed.majorityRule ?? DEFAULT_MAJORITY_RULE,
				abstentionsCounted: parsed.abstentionsCounted ?? false
			}
		};
	}

	if (parsed.positionCount == null) {
		throw new Error('Selection Vote is missing a position count.');
	}
	const positionCount = parsed.positionCount;

	return {
		kind: 'selection',
		title: parsed.title,
		selection: {
			mode: selectionModeFromPositionCount(positionCount),
			positionCount,
			vacancyEnabled: parsed.vacancyEnabled ?? false,
			optionLabels: parsed.options ?? []
		}
	};
}
