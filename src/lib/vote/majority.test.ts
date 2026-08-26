import { describe, expect, it } from 'vitest';
import { majorityRequirement, majorityRuleLabel } from './majority.js';

describe('majority copy', () => {
	it('names the closed-vote rule without a middle dot', () => {
		expect(majorityRuleLabel({ majorityRule: 'simple', abstentionsCounted: false })).toBe(
			'Fler röstar för än emot'
		);
		expect(majorityRuleLabel({ majorityRule: 'qualified', abstentionsCounted: false })).toBe(
			'Minst två tredjedelar röstar för, avståenden påverkar inte utfallet'
		);
		expect(majorityRuleLabel({ majorityRule: 'qualified', abstentionsCounted: true })).toBe(
			'Minst två tredjedelar röstar för, avståenden räknas med'
		);
	});

	it('explains the live-vote requirement in the present tense', () => {
		expect(majorityRequirement({ majorityRule: 'simple', abstentionsCounted: false })).toBe(
			'Förslaget går igenom om fler röstar för än emot. Avståenden påverkar inte utfallet.'
		);
		expect(majorityRequirement({ majorityRule: 'qualified', abstentionsCounted: false })).toBe(
			'Förslaget går igenom om minst två tredjedelar av rösterna för eller emot är för. Avståenden påverkar inte utfallet.'
		);
		expect(majorityRequirement({ majorityRule: 'qualified', abstentionsCounted: true })).toBe(
			'Förslaget går igenom om minst två tredjedelar av alla röster är för. Avståenden räknas med.'
		);
	});
});
