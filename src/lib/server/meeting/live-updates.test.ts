import { meetingPubSub } from '#lib/server/pubsub.js';
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
			meetingPubSub.publish('meeting-1', 3);
			await vi.advanceTimersByTimeAsync(100);
			expect(await stream.next()).toEqual({ value: { revision: 3 }, done: false });

			revision = 2;
			const pending = stream.next();
			meetingPubSub.publish('meeting-1', 2);
			await vi.advanceTimersByTimeAsync(100);
			revision = 4;
			meetingPubSub.publish('meeting-1', 4);
			await vi.advanceTimersByTimeAsync(100);
			expect(await pending).toEqual({ value: { revision: 4 }, done: false });

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
			meetingPubSub.publish('meeting-2', 1);
			await vi.advanceTimersByTimeAsync(100);

			const pending = stream.next();
			let completed = false;
			void pending.then(() => {
				completed = true;
			});
			await Promise.resolve();
			expect(completed).toBe(false);
			revision = 2;
			meetingPubSub.publish('meeting-1', 2);
			await vi.advanceTimersByTimeAsync(100);
			await pending;

			controller.abort();
			await stream.return(undefined);
		} finally {
			vi.useRealTimers();
		}
	});
});
