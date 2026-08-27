import { meetingPubSub } from '#lib/server/pubsub.js';
import { createTimingContext, type TimingEvent } from '#lib/server/timing.js';
import { describe, expect, it, vi } from 'vitest';
import { liveMeetingSnapshots } from './live-updates.js';

describe('live Meeting snapshots', () => {
	it('reads the current state after a matching update and skips older revisions', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let revision = 1;

		try {
			const stream = liveMeetingSnapshots(
				'meeting-1',
				async () => ({ revision }),
				controller.signal
			);

			expect(await stream.next()).toEqual({ value: { revision: 1 }, done: false });

			revision = 3;
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 3 });
			await vi.runOnlyPendingTimersAsync();
			expect(await stream.next()).toEqual({ value: { revision: 3 }, done: false });

			revision = 2;
			const pending = stream.next();

			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 2 });
			await vi.runOnlyPendingTimersAsync();
			revision = 4;
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 4 });
			await vi.runOnlyPendingTimersAsync();
			expect(await pending).toEqual({ value: { revision: 4 }, done: false });

			controller.abort();
			await stream.return(undefined);
		} finally {
			vi.useRealTimers();
		}
	});

	it('rereads after ballot activity without requiring a Meeting revision change', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let count = 0;

		try {
			const stream = liveMeetingSnapshots(
				'meeting-1',
				async () => ({ revision: 1, count }),
				controller.signal,
				undefined,
				{ ballotActivity: true }
			);

			expect(await stream.next()).toEqual({ value: { revision: 1, count: 0 }, done: false });

			count = 1;
			meetingPubSub.publish('meeting-1', { kind: 'ballot-activity' });
			await vi.runOnlyPendingTimersAsync();

			expect(await stream.next()).toEqual({ value: { revision: 1, count: 1 }, done: false });

			controller.abort();
			await stream.return(undefined);
		} finally {
			vi.useRealTimers();
		}
	});

	it('carries the ballot source correlation ID into organizer timing events', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const events: TimingEvent[] = [];
		const previous = process.env.VOTUM_TIMINGS;

		process.env.VOTUM_TIMINGS = '1';
		let count = 0;

		try {
			const organizerTiming = createTimingContext((event) => events.push(event));
			const sourceTiming = createTimingContext(() => undefined);
			const stream = liveMeetingSnapshots(
				'meeting-1',
				async () => ({ revision: 1, count }),
				controller.signal,
				organizerTiming,
				{ ballotActivity: true }
			);

			expect(await stream.next()).toEqual({
				value: { revision: 1, count: 0 },
				done: false
			});

			count = 1;
			meetingPubSub.publish('meeting-1', { kind: 'ballot-activity' }, { timing: sourceTiming });
			await vi.runOnlyPendingTimersAsync();
			expect(await stream.next()).toEqual({
				value: { revision: 1, count: 1 },
				done: false
			});

			const rereadEnd = events.find(
				(event) => event.operation === 'organizer.reread' && event.phase === 'end'
			);

			expect(rereadEnd).toMatchObject({
				correlationId: organizerTiming.correlationId,
				sourceCorrelationId: sourceTiming.correlationId
			});

			controller.abort();
			await stream.return(undefined);
		} finally {
			if (previous === undefined) {
				delete process.env.VOTUM_TIMINGS;
			} else {
				process.env.VOTUM_TIMINGS = previous;
			}
			vi.useRealTimers();
		}
	});

	it('does not reread a participant snapshot for ballot activity', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let reads = 0;
		let revision = 1;

		try {
			const stream = liveMeetingSnapshots(
				'meeting-1',
				async () => ({ revision, reads: ++reads }),
				controller.signal,
				undefined,
				{ ballotActivity: false }
			);

			expect(await stream.next()).toEqual({ value: { revision: 1, reads: 1 }, done: false });

			const pending = stream.next();

			meetingPubSub.publish('meeting-1', { kind: 'ballot-activity' });
			await vi.runOnlyPendingTimersAsync();
			expect(reads).toBe(1);

			revision = 2;
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 2 });
			await vi.runOnlyPendingTimersAsync();
			expect(await pending).toEqual({ value: { revision: 2, reads: 2 }, done: false });

			controller.abort();
			await stream.return(undefined);
		} finally {
			vi.useRealTimers();
		}
	});

	it('ends when the request is aborted while waiting', async () => {
		const controller = new AbortController();
		const stream = liveMeetingSnapshots(
			'meeting-1',
			async () => ({ revision: 1 }),
			controller.signal
		);

		expect(await stream.next()).toEqual({ value: { revision: 1 }, done: false });
		const pending = stream.next();

		controller.abort();
		expect(await pending).toEqual({ value: undefined, done: true });
	});

	it('does not wake a stream for another Meeting', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let revision = 1;

		try {
			const stream = liveMeetingSnapshots(
				'meeting-1',
				async () => ({ revision }),
				controller.signal
			);

			expect(await stream.next()).toEqual({ value: { revision: 1 }, done: false });
			meetingPubSub.publish('meeting-2', { kind: 'revision', revision: 1 });
			await vi.runOnlyPendingTimersAsync();

			const pending = stream.next();
			let completed = false;

			void pending.then(() => {
				completed = true;
			});
			await Promise.resolve();
			expect(completed).toBe(false);
			revision = 2;
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 2 });
			await vi.runOnlyPendingTimersAsync();
			await pending;

			controller.abort();
			await stream.return(undefined);
		} finally {
			vi.useRealTimers();
		}
	});
});
