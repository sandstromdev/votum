import { describe, expect, it } from 'vitest';
import { majorityRequirement, majorityRuleLabel } from './majority.js';

describe('majority copy', () => {
	it('names the closed-vote rule without a middle dot', () => {
		expect(majorityRuleLabel({ majorityRule: 'simple', abstentionsCounted: false })).toBe(
			'Enkel majoritet'
		);
		expect(majorityRuleLabel({ majorityRule: 'qualified', abstentionsCounted: false })).toBe(
			'Kvalificerad majoritet'
		);
		expect(majorityRuleLabel({ majorityRule: 'qualified', abstentionsCounted: true })).toBe(
			'Kvalificerad majoritet, avståenden räknades'
		);
	});

	it('explains the live-vote requirement in the present tense', () => {
		expect(majorityRequirement({ majorityRule: 'simple', abstentionsCounted: false })).toBe(
			'Fler röster för än emot. Avståenden räknas inte.'
		);
		expect(majorityRequirement({ majorityRule: 'qualified', abstentionsCounted: false })).toBe(
			'Minst två tredjedelar ja mot nej.'
		);
		expect(majorityRequirement({ majorityRule: 'qualified', abstentionsCounted: true })).toBe(
			'Minst två tredjedelar ja av alla röster, avståenden inräknade.'
		);
	});
});
