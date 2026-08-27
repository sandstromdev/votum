import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { draftVoteSchema } from './vote.js';

describe('Vote schemas', () => {
	it('validates the two Vote configuration shapes', () => {
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				voteId: uuidv7(),
				title: 'Fråga',
				kind: 'decision',
				supportLabel: 'För',
				opposeLabel: 'Emot',
				abstentionLabel: 'Avstår'
			}).success
		).toBe(true);
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				title: 'Val',
				kind: 'selection',
				positionCount: 1,
				vacancyEnabled: true,
				options: ['Ada']
			}).success
		).toBe(true);
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				title: 'Val',
				kind: 'selection',
				positionCount: 2,
				vacancyEnabled: true,
				options: ['Ada']
			}).success
		).toBe(true);
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				title: 'Val',
				kind: 'selection',
				positionCount: 2,
				vacancyEnabled: true,
				options: ['Ada', 'Ada']
			}).success
		).toBe(false);
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				title: 'Val',
				kind: 'selection',
				positionCount: 2,
				vacancyEnabled: true,
				options: ['p1', 'P1']
			}).success
		).toBe(false);
	});

	it('defaults omitted checkbox fields to false (FormData omit semantics)', () => {
		const decision = draftVoteSchema.parse({
			meetingId: uuidv7(),
			title: 'Fråga',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		});

		expect(decision.abstentionsCounted).toBe(false);

		const selection = draftVoteSchema.parse({
			meetingId: uuidv7(),
			title: 'Val',
			kind: 'selection',
			positionCount: 1,
			options: ['Ada']
		});

		expect(selection.vacancyEnabled).toBe(false);
	});

	it('accepts Qualified majority with counted Abstentions', () => {
		expect(
			draftVoteSchema.safeParse({
				meetingId: uuidv7(),
				title: 'Stadgar',
				kind: 'decision',
				supportLabel: 'För',
				opposeLabel: 'Emot',
				abstentionLabel: 'Avstår',
				majorityRule: 'qualified',
				abstentionsCounted: true
			}).success
		).toBe(true);
	});

	it('rejects counted Abstentions for Simple majority and custom rules', () => {
		const base = {
			meetingId: uuidv7(),
			title: 'Stadgar',
			kind: 'decision',
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstår'
		};

		expect(
			draftVoteSchema.safeParse({ ...base, majorityRule: 'simple', abstentionsCounted: true })
				.success
		).toBe(false);
		expect(draftVoteSchema.safeParse({ ...base, majorityRule: 'custom' }).success).toBe(false);
	});
});
