import { describe, expect, it } from 'vitest';
import {
	createTimingContext,
	timingEnd,
	timingStart,
	withTiming,
	type TimingEvent
} from './timing.js';

describe('server timing', () => {
	it('does not emit events unless explicitly enabled', () => {
		const events: TimingEvent[] = [];
		const previous = process.env.VOTUM_TIMINGS;
		delete process.env.VOTUM_TIMINGS;

		try {
			const context = createTimingContext((event) => events.push(event));
			const startedAt = timingStart(context, 'test.operation');
			timingEnd(context, 'test.operation', startedAt, 'success');
			expect(events).toEqual([]);
		} finally {
			if (previous === undefined) delete process.env.VOTUM_TIMINGS;
			else process.env.VOTUM_TIMINGS = previous;
		}
	});

	it('emits correlated start and end events without request data', async () => {
		const events: TimingEvent[] = [];
		const previous = process.env.VOTUM_TIMINGS;
		process.env.VOTUM_TIMINGS = '1';

		try {
			const context = createTimingContext((event) => events.push(event));
			await withTiming(context, 'test.operation', async () => undefined);

			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				type: 'votum.timing',
				phase: 'start',
				operation: 'test.operation',
				correlationId: context.correlationId
			});
			expect(events[1]).toMatchObject({
				phase: 'end',
				operation: 'test.operation',
				correlationId: context.correlationId,
				outcome: 'success'
			});
			expect(events[1]?.durationMs).toEqual(expect.any(Number));
			expect(Object.keys(events[1] ?? {}).sort()).toEqual([
				'correlationId',
				'durationMs',
				'operation',
				'outcome',
				'phase',
				'type'
			]);
		} finally {
			if (previous === undefined) delete process.env.VOTUM_TIMINGS;
			else process.env.VOTUM_TIMINGS = previous;
		}
	});

	it('records an error end event and preserves the original error', async () => {
		const events: TimingEvent[] = [];
		const previous = process.env.VOTUM_TIMINGS;
		process.env.VOTUM_TIMINGS = '1';
		const expected = new Error('expected');

		try {
			await expect(
				withTiming(
					createTimingContext((event) => events.push(event)),
					'test.operation',
					async () => {
						throw expected;
					}
				)
			).rejects.toBe(expected);
			expect(events.at(-1)).toMatchObject({ phase: 'end', outcome: 'error' });
		} finally {
			if (previous === undefined) delete process.env.VOTUM_TIMINGS;
			else process.env.VOTUM_TIMINGS = previous;
		}
	});
});
