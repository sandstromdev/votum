import { describe, expect, it } from 'vitest';
import { compareVotesByOpenedAt } from './agenda.js';

describe('Vote agenda ordering', () => {
	it('sorts completed Votes by when they opened, then planned position', () => {
		const early = { openedAt: new Date('2026-08-19T10:00:00Z'), position: 3 };
		const late = { openedAt: new Date('2026-08-19T10:01:00Z'), position: 1 };
		const sameTimeEarlierPosition = {
			openedAt: early.openedAt,
			position: 1
		};

		expect([late, early].toSorted(compareVotesByOpenedAt)).toEqual([early, late]);
		expect([sameTimeEarlierPosition, early].toSorted(compareVotesByOpenedAt)).toEqual([
			sameTimeEarlierPosition,
			early
		]);
	});
});
