export const DECISION_BALLOT_CHOICES = ['support', 'oppose', 'abstention'] as const;
export type DecisionBallotChoice = (typeof DECISION_BALLOT_CHOICES)[number];

export const STALE_ACTIVE_VOTE_MESSAGE =
	'Omröstningen har ändrats. Uppdatera sidan och försök igen.';
