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
	if (majorityRule === 'simple') {
		return 'Fler röstar för än emot';
	}

	return abstentionsCounted
		? 'Minst två tredjedelar röstar för, avståenden räknas med'
		: 'Minst två tredjedelar röstar för, avståenden påverkar inte utfallet';
}

export function majorityRequirement({
	majorityRule,
	abstentionsCounted
}: DecisionMajorityConfiguration) {
	if (majorityRule === 'simple') {
		return 'Förslaget går igenom om fler röstar för än emot. Avståenden påverkar inte utfallet.';
	}
	if (abstentionsCounted) {
		return 'Förslaget går igenom om minst två tredjedelar av alla röster är för. Avståenden räknas med.';
	}

	return 'Förslaget går igenom om minst två tredjedelar av rösterna för eller emot är för. Avståenden påverkar inte utfallet.';
}
