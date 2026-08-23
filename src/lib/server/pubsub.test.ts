import { meetingPubSub } from '#lib/server/pubsub.js';
import { describe, expect, it, vi } from 'vitest';

describe('MeetingPubSub', () => {
	it('yields the highest revision', async () => {
		vi.useFakeTimers();

		try {
			const controller = new AbortController();
			const stream = meetingPubSub.listen('meeting-1', controller.signal);

			const pending = stream.next();

			await Promise.resolve();

			meetingPubSub.publish('meeting-1', 1);
			meetingPubSub.publish('meeting-1', 3);
			meetingPubSub.publish('meeting-1', 2);

			await vi.advanceTimersByTimeAsync(100);

			expect(await pending).toEqual({
				value: 3,
				done: false
			});

			stream.return();
		} finally {
			vi.useRealTimers();
		}
	});

	it('ends when aborted while waiting', async () => {
		const controller = new AbortController();
		const stream = meetingPubSub.listen('meeting-2', controller.signal);

		const pending = stream.next();

		await Promise.resolve();

		controller.abort();

		expect(await pending).toEqual({
			value: undefined,
			done: true
		});

		stream.return();
	});

	it('handles errors in the listener', async () => {
		const handler = vi.fn((payload: number) => {
			throw new Error(`Error in listener: ${payload}`);
		});

		meetingPubSub.subscribe('meeting-3', handler);

		vi.useFakeTimers();

		try {
			meetingPubSub.publish('meeting-3', 1);

			await vi.advanceTimersByTimeAsync(100);

			meetingPubSub.publish('meeting-3', 2);

			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledWith(1);
			expect(handler).not.toHaveBeenCalledWith(2);
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears pending flushes when channel is deleted', async () => {
		vi.useFakeTimers();

		const handler = vi.fn();

		const unsub = meetingPubSub.subscribe('meeting-4', handler);

		try {
			meetingPubSub.publish('meeting-4', 1);

			unsub();

			await vi.advanceTimersByTimeAsync(100);

			expect(handler).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
