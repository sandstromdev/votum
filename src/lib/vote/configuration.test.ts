import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import type { OrganizerVote } from './agenda.js';
import {
	draftInputToVoteConfiguration,
	organizerVoteToDraftFields,
	selectionModeFromPositionCount
} from './configuration.js';

describe('Vote configuration', () => {
	it('derives Single-winner and Multi-winner from position count', () => {
		expect(selectionModeFromPositionCount(1)).toBe('single');
		expect(selectionModeFromPositionCount(2)).toBe('multiple');
	});

	it('maps a nested Decision Vote to flat draft fields', () => {
		const vote: OrganizerVote = {
			id: uuidv7(),
			meetingId: uuidv7(),
			position: 0,
			title: 'Budget',
			lifecycle: 'draft',
			openedAt: null,
			closedAt: null,
			rerunOfVoteId: null,
			invalidationReason: null,
			invalidatedAt: null,
			kind: 'decision',
			decision: {
				supportLabel: 'Ja',
				opposeLabel: 'Nej',
				abstentionLabel: 'Avstår',
				majorityRule: 'qualified',
				abstentionsCounted: true
			}
		};

		expect(organizerVoteToDraftFields(vote)).toMatchObject({
			title: 'Budget',
			kind: 'decision',
			supportLabel: 'Ja',
			opposeLabel: 'Nej',
			abstentionLabel: 'Avstår',
			majorityRule: 'qualified',
			abstentionsCounted: true
		});
	});

	it('round-trips Selection option labels through the nested write shape', () => {
		const meetingId = uuidv7();
		const vote: OrganizerVote = {
			id: uuidv7(),
			meetingId,
			position: 0,
			title: 'Val',
			lifecycle: 'draft',
			openedAt: null,
			closedAt: null,
			rerunOfVoteId: null,
			invalidationReason: null,
			invalidatedAt: null,
			kind: 'selection',
			selection: {
				mode: 'multiple',
				positionCount: 2,
				vacancyEnabled: true,
				options: [
					{ id: uuidv7(), label: 'Ada', position: 0 },
					{ id: uuidv7(), label: 'Grace', position: 1 }
				]
			}
		};

		const fields = organizerVoteToDraftFields(vote);
		expect(fields.options).toEqual(['Ada', 'Grace']);
		expect(draftInputToVoteConfiguration({ ...fields, meetingId })).toEqual({
			kind: 'selection',
			title: 'Val',
			selection: {
				mode: 'multiple',
				positionCount: 2,
				vacancyEnabled: true,
				optionLabels: ['Ada', 'Grace']
			}
		});
	});

	it('defaults Decision Votes to Simple majority with Abstentions excluded', () => {
		expect(organizerVoteToDraftFields()).toMatchObject({
			majorityRule: 'simple',
			abstentionsCounted: false
		});
	});

	it('maps omitted Selection vacancy checkbox as false, not product default', () => {
		const meetingId = uuidv7();
		expect(
			draftInputToVoteConfiguration({
				meetingId,
				title: 'Val',
				kind: 'selection',
				positionCount: 1,
				options: ['Ada']
			})
		).toMatchObject({
			selection: { vacancyEnabled: false }
		});
	});
});
