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

			meetingPubSub.publish('meeting-1', 1);
			meetingPubSub.publish('meeting-1', 3);
			meetingPubSub.publish('meeting-1', 2);

			await vi.runOnlyPendingTimersAsync();

			expect(await pending).toEqual({
				value: {
					kind: 'revision',
					revision: 3,
					ballotActivity: false,
					participantTokenHashes: []
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
			const stream = meetingPubSub.listen('meeting-1', controller.signal);
			const pending = stream.next();
			const sourceTiming = createTimingContext();

			await Promise.resolve();

			meetingPubSub.publishBallotActivity('meeting-1', {
				timing: sourceTiming,
				participantTokenHash: 'token-a'
			});
			meetingPubSub.publish('meeting-1', 4);
			meetingPubSub.publishBallotActivity('meeting-1');
			await vi.runOnlyPendingTimersAsync();

			expect(await pending).toEqual({
				value: {
					kind: 'revision',
					revision: 4,
					ballotActivity: true,
					participantTokenHashes: ['token-a'],
					sourceCorrelationId: sourceTiming.correlationId
				},
				done: false
			});

			await stream.return();
		} finally {
			vi.useRealTimers();
		}
	});

	it('routes ballot activity to organizers and the matching participant only', async () => {
		vi.useFakeTimers();

		const organizer = vi.fn();
		const participantA = vi.fn();
		const participantB = vi.fn();
		const participantWithoutToken = vi.fn();
		const unsubscribeOrganizer = meetingPubSub.subscribe('meeting-routing', organizer);
		const unsubscribeParticipantA = meetingPubSub.subscribe('meeting-routing', participantA, {
			participantTokenHash: 'token-a'
		});
		const unsubscribeParticipantB = meetingPubSub.subscribe('meeting-routing', participantB, {
			participantTokenHash: 'token-b'
		});
		const unsubscribeParticipantWithoutToken = meetingPubSub.subscribe(
			'meeting-routing',
			participantWithoutToken,
			{
				participantTokenHash: null
			}
		);

		try {
			meetingPubSub.publishBallotActivity('meeting-routing', {
				participantTokenHash: 'token-a'
			});
			await vi.runOnlyPendingTimersAsync();

			expect(organizer).toHaveBeenCalledOnce();
			expect(participantA).toHaveBeenCalledOnce();
			expect(participantB).not.toHaveBeenCalled();
			expect(participantWithoutToken).not.toHaveBeenCalled();
		} finally {
			unsubscribeOrganizer();
			unsubscribeParticipantA();
			unsubscribeParticipantB();
			unsubscribeParticipantWithoutToken();
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
			meetingPubSub.publish('meeting-3', 1);

			await vi.runOnlyPendingTimersAsync();

			meetingPubSub.publish('meeting-3', 2);

			await vi.runOnlyPendingTimersAsync();

			expect(handler).toHaveBeenCalledWith({
				kind: 'revision',
				revision: 1,
				ballotActivity: false,
				participantTokenHashes: []
			});
			expect(handler).not.toHaveBeenCalledWith({
				kind: 'revision',
				revision: 2,
				ballotActivity: false,
				participantTokenHashes: []
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
			meetingPubSub.publish('meeting-4', 1);

			unsub();

			await vi.runOnlyPendingTimersAsync();

			expect(handler).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
