import { meetingPubSub, type MeetingUpdate } from '#lib/server/pubsub.js';
import { createTimingContext } from '#lib/server/timing.js';
import { describe, expect, it, vi } from 'vitest';

describe('MeetingPubSub', () => {
	it('yields the highest revision', async () => {
		vi.useFakeTimers();

		try {
			const controller = new AbortController();
			const stream = meetingPubSub.listen('meeting-1', controller.signal);

			const pending = stream.next();

			await Promise.resolve();

			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 1 });
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 3 });
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 2 });

			await vi.runOnlyPendingTimersAsync();

			expect(await pending).toEqual({
				value: {
					kind: 'revision',
					revision: 3,
					ballotActivity: false
				},
				done: false
			});

			stream.return();
		} finally {
			vi.useRealTimers();
		}
	});

	it('coalesces ballot activity with the latest Meeting revision', async () => {
		vi.useFakeTimers();

		try {
			const controller = new AbortController();
			const stream = meetingPubSub.listen('meeting-1', controller.signal, { ballotActivity: true });
			const pending = stream.next();
			const sourceTiming = createTimingContext();

			await Promise.resolve();

			meetingPubSub.publish('meeting-1', { kind: 'ballot-activity' }, { timing: sourceTiming });
			meetingPubSub.publish('meeting-1', { kind: 'revision', revision: 4 });
			meetingPubSub.publish('meeting-1', { kind: 'ballot-activity' });
			await vi.runOnlyPendingTimersAsync();

			expect(await pending).toEqual({
				value: {
					kind: 'revision',
					revision: 4,
					ballotActivity: true,
					sourceCorrelationId: sourceTiming.correlationId
				},
				done: false
			});

			await stream.return();
		} finally {
			vi.useRealTimers();
		}
	});

	it('routes ballot activity only to subscribers that opt in', async () => {
		vi.useFakeTimers();

		const organizer = vi.fn();
		const participantA = vi.fn();
		const participantB = vi.fn();
		const presentation = vi.fn();
		const unsubscribeOrganizer = meetingPubSub.subscribe('meeting-routing', organizer, {
			ballotActivity: true
		});
		const unsubscribePresentation = meetingPubSub.subscribe('meeting-routing', presentation, {
			ballotActivity: true
		});
		const unsubscribeParticipantA = meetingPubSub.subscribe('meeting-routing', participantA, {
			ballotActivity: false
		});
		const unsubscribeParticipantB = meetingPubSub.subscribe('meeting-routing', participantB);

		try {
			meetingPubSub.publish('meeting-routing', { kind: 'ballot-activity' });
			await vi.runOnlyPendingTimersAsync();

			expect(organizer).toHaveBeenCalledOnce();
			expect(presentation).toHaveBeenCalledOnce();
			expect(participantA).not.toHaveBeenCalled();
			expect(participantB).not.toHaveBeenCalled();
		} finally {
			unsubscribeOrganizer();
			unsubscribePresentation();
			unsubscribeParticipantA();
			unsubscribeParticipantB();
			vi.useRealTimers();
		}
	});

	it('routes lifecycle revisions to participants regardless of ballot activity opt-in', async () => {
		vi.useFakeTimers();

		const organizer = vi.fn();
		const presentation = vi.fn();
		const participant = vi.fn();
		const unsubscribeOrganizer = meetingPubSub.subscribe('meeting-lifecycle', organizer, {
			ballotActivity: true
		});
		const unsubscribePresentation = meetingPubSub.subscribe('meeting-lifecycle', presentation, {
			ballotActivity: true
		});
		const unsubscribeParticipant = meetingPubSub.subscribe('meeting-lifecycle', participant, {
			ballotActivity: false
		});

		try {
			meetingPubSub.publish('meeting-lifecycle', { kind: 'revision', revision: 2 });
			await vi.runOnlyPendingTimersAsync();

			const expected = { kind: 'revision', revision: 2, ballotActivity: false };
			expect(organizer).toHaveBeenCalledWith(expected);
			expect(presentation).toHaveBeenCalledWith(expected);
			expect(participant).toHaveBeenCalledWith(expected);
		} finally {
			unsubscribeOrganizer();
			unsubscribePresentation();
			unsubscribeParticipant();
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
		const handler = vi.fn((payload: MeetingUpdate) => {
			throw new Error(
				`Error in listener: ${payload.kind === 'revision' ? payload.revision : 'ballot activity'}`
			);
		});

		meetingPubSub.subscribe('meeting-3', handler);

		vi.useFakeTimers();

		try {
			meetingPubSub.publish('meeting-3', { kind: 'revision', revision: 1 });

			await vi.runOnlyPendingTimersAsync();

			meetingPubSub.publish('meeting-3', { kind: 'revision', revision: 2 });

			await vi.runOnlyPendingTimersAsync();

			expect(handler).toHaveBeenCalledWith({
				kind: 'revision',
				revision: 1,
				ballotActivity: false
			});
			expect(handler).not.toHaveBeenCalledWith({
				kind: 'revision',
				revision: 2,
				ballotActivity: false
			});
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
			meetingPubSub.publish('meeting-4', { kind: 'revision', revision: 1 });

			unsub();

			await vi.runOnlyPendingTimersAsync();

			expect(handler).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
