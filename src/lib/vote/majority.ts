export const MAJORITY_RULES = ['simple', 'qualified'] satisfies readonly ['simple', 'qualified'];
export type MajorityRule = (typeof MAJORITY_RULES)[number];

export const DEFAULT_MAJORITY_RULE: MajorityRule = 'simple';
export const DEFAULT_ABSTENTIONS_COUNTED = false;

export type DecisionMajorityConfiguration = {
	majorityRule: MajorityRule;
	abstentionsCounted: boolean;
};

export function majorityRuleLabel({
	majorityRule,
	abstentionsCounted
}: DecisionMajorityConfiguration) {
	if (majorityRule === 'simple') return 'Enkel majoritet';
	return abstentionsCounted
		? 'Kvalificerad majoritet, avståenden räknades'
		: 'Kvalificerad majoritet';
}

export function majorityRequirement({
	majorityRule,
	abstentionsCounted
}: DecisionMajorityConfiguration) {
	if (majorityRule === 'simple') return 'Fler röster för än emot. Avståenden räknas inte.';
	if (abstentionsCounted) return 'Minst två tredjedelar ja av alla röster, avståenden inräknade.';
	return 'Minst två tredjedelar ja mot nej.';
}
