import type { OrganizerVote } from './agenda.js';
import type { DecisionBallotChoice } from './ballot.js';
import type { OutcomeHistoryEntry, PublicVoteResult } from './outcome.js';

export const MEETING_LIFECYCLES = ['draft', 'open', 'closed'] as const;
export type MeetingLifecycle = (typeof MEETING_LIFECYCLES)[number];

export type OrganizerMeeting = {
	id: string;
	title: string;
	publicLocator: string;
	participantPath: string;
	presentationPath: string;
	presentationQrEnabled: boolean;
	lifecycle: MeetingLifecycle;
	expectedParticipantCount: number | null;
	activeBallotCount: number | null;
	revision: number;
	createdAt: Date;
	agenda: OrganizerVote[];
	outcomeHistory: OutcomeHistoryEntry[];
};

export type ParticipantBallot =
	| { type: 'decision'; choice: DecisionBallotChoice }
	| { type: 'selection'; selectedOptionIds: string[]; vacancyCount: number; abstain: boolean };

type ParticipantDecisionLabels = {
	supportLabel: string;
	opposeLabel: string;
	abstentionLabel: string;
};

export type ParticipantProjection =
	| {
			state: 'invalid';
			message: string;
	  }
	| {
			state: 'waiting' | 'ended';
			meeting: { title: string };
			participation: { current: number; expected: number | null };
			revision: number;
	  }
	| {
			state: 'closed';
			meeting: { title: string };
			vote:
				| {
						kind: 'decision';
						title: string;
						decision: ParticipantDecisionLabels;
				  }
				| { kind: 'selection'; title: string };
			participation: { current: number; expected: number | null };
			result: PublicVoteResult;
			revision: number;
	  }
	| {
			state: 'active';
			meeting: { title: string };
			activeVoteKey: string;
			vote:
				| {
						kind: 'decision';
						title: string;
						decision: ParticipantDecisionLabels & { majorityLabel: string };
				  }
				| {
						kind: 'selection';
						title: string;
						selection: {
							mode: 'single' | 'multiple';
							positionCount: number;
							vacancyEnabled: boolean;
							options: Array<{ id: string; label: string }>;
						};
				  };
			participation: { current: number; expected: number | null };
			revision: number;
	  };

export type PresentationProjection =
	| {
			state: 'invalid';
			message: string;
	  }
	| {
			state: 'waiting' | 'ended';
			meeting: { title: string };
			participation: { current: number; expected: number | null };
			presentationQrEnabled: boolean;
			revision: number;
	  }
	| {
			state: 'closed';
			meeting: { title: string };
			vote:
				| {
						kind: 'decision';
						title: string;
						decision: ParticipantDecisionLabels;
				  }
				| { kind: 'selection'; title: string };
			participation: { current: number; expected: number | null };
			presentationQrEnabled: boolean;
			result: PublicVoteResult;
			revision: number;
	  }
	| {
			state: 'active';
			meeting: { title: string };
			vote:
				| {
						kind: 'decision';
						title: string;
						decision: ParticipantDecisionLabels & { majorityLabel: string };
				  }
				| {
						kind: 'selection';
						title: string;
						selection: {
							mode: 'single' | 'multiple';
							positionCount: number;
							vacancyEnabled: boolean;
							options: Array<{ label: string }>;
						};
				  };
			participation: { current: number; expected: number | null };
			presentationQrEnabled: boolean;
			revision: number;
	  };

export type ParticipantPageProjection =
	| Exclude<ParticipantProjection, { state: 'active' }>
	| (Extract<ParticipantProjection, { state: 'active' }> & {
			currentBallot: ParticipantBallot | null;
	  });
