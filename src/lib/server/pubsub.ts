import {
	createTimingContext,
	timingEnd,
	timingStart,
	type TimingContext
} from '#lib/server/timing.js';
import { VOTUM_LIVE_UPDATE_DEBOUNCE_MS } from '$app/env/private';

type MeetingId = string;
type SubscriberId = string;

export type MeetingPublication =
	| {
			kind: 'revision';
			revision: number;
	  }
	| {
			kind: 'ballot-activity';
	  };

export type MeetingUpdate =
	| {
			kind: 'revision';
			revision: number;
			ballotActivity: boolean;
			sourceCorrelationId?: string;
	  }
	| {
			kind: 'ballot-activity';
			sourceCorrelationId?: string;
	  };

export type MeetingSubscriptionOptions = {
	ballotActivity?: boolean;
};

type MeetingPublishOptions = {
	timing?: TimingContext;
};

type Subscriber = {
	id: SubscriberId;
	subscribeFn: SubscribeFn;
	options: MeetingSubscriptionOptions;
};
type SubscribeFn = (update: MeetingUpdate) => void;

type ChannelMap = Map<MeetingId, Map<SubscriberId, Subscriber>>;
type PendingMap = Map<
	MeetingId,
	{
		revision: number | undefined;
		ballotActivity: boolean;
		sourceCorrelationId: string | undefined;
		timer: NodeJS.Timeout;
	}
>;

const DEFAULT_LIVE_UPDATE_DEBOUNCE_MS = 500;
const LIVE_UPDATE_DEBOUNCE_MS = VOTUM_LIVE_UPDATE_DEBOUNCE_MS ?? DEFAULT_LIVE_UPDATE_DEBOUNCE_MS;

class MeetingPubSub {
	#channels: ChannelMap = new Map();
	#pending: PendingMap = new Map();

	subscribe(
		meetingId: MeetingId,
		subscriber: SubscribeFn,
		options: MeetingSubscriptionOptions = {}
	) {
		let channel = this.#channels.get(meetingId);

		if (!channel) {
			channel = new Map();
			this.#channels.set(meetingId, channel);
		}

		const subscriberId = crypto.randomUUID();
		const subscriberObj = {
			id: subscriberId,
			subscribeFn: subscriber,
			options
		} satisfies Subscriber;

		channel.set(subscriberId, subscriberObj);

		return () => {
			this.#delete(meetingId, subscriberId);
		};
	}

	async *listen(
		meetingId: MeetingId,
		signal: AbortSignal,
		options: MeetingSubscriptionOptions = {}
	) {
		let latestRevision: number | undefined;
		let ballotActivity = false;
		let sourceCorrelationId: string | undefined;
		let resolveWait: (() => void) | undefined;

		function onPayload(update: MeetingUpdate) {
			if (update.kind === 'revision') {
				latestRevision = Math.max(latestRevision ?? 0, update.revision);
				ballotActivity ||= update.ballotActivity;
			} else {
				ballotActivity = true;
			}
			if (update.sourceCorrelationId !== undefined) {
				sourceCorrelationId = update.sourceCorrelationId;
			}

			const resolve = resolveWait;
			resolveWait = undefined;
			resolve?.();
		}

		function onAbort() {
			const resolve = resolveWait;
			resolveWait = undefined;
			resolve?.();
		}

		const unsubscribe = this.subscribe(meetingId, onPayload, options);

		signal.addEventListener('abort', onAbort);

		try {
			while (!signal.aborted) {
				if (latestRevision === undefined && !ballotActivity) {
					await new Promise<void>((resolve) => {
						resolveWait = resolve;
					});
				}

				if (signal.aborted) {
					break;
				}

				if (latestRevision === undefined && !ballotActivity) {
					continue;
				}

				if (latestRevision === undefined) {
					yield {
						kind: 'ballot-activity',
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					};
				} else {
					yield {
						kind: 'revision',
						revision: latestRevision,
						ballotActivity,
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					};
				}
				latestRevision = undefined;
				ballotActivity = false;
				sourceCorrelationId = undefined;
			}
		} finally {
			unsubscribe();
			signal.removeEventListener('abort', onAbort);
		}
	}

	#publish(meetingId: MeetingId, update: MeetingPublication & { sourceCorrelationId?: string }) {
		const pending = this.#pending.get(meetingId);

		if (pending) {
			if (update.kind === 'revision') {
				pending.revision = Math.max(pending.revision ?? 0, update.revision);
			}
			if (update.kind === 'ballot-activity') {
				pending.ballotActivity = true;
			}
			if (update.sourceCorrelationId !== undefined) {
				pending.sourceCorrelationId = update.sourceCorrelationId;
			}
			return;
		}

		const timer = setTimeout(() => {
			this.#flush(meetingId);
		}, LIVE_UPDATE_DEBOUNCE_MS);

		this.#pending.set(meetingId, {
			revision: update.kind === 'revision' ? update.revision : undefined,
			ballotActivity: update.kind === 'ballot-activity',
			sourceCorrelationId: update.sourceCorrelationId,
			timer
		});
	}

	publish(
		meetingId: MeetingId,
		update: MeetingPublication,
		{ timing: inputTiming }: MeetingPublishOptions = {}
	) {
		if (update.kind !== 'ballot-activity') {
			this.#publish(meetingId, update);
			return;
		}

		const timing = inputTiming ?? createTimingContext();
		const sourceCorrelationId = inputTiming?.correlationId;
		const startedAt = timingStart(timing, 'ballot.publishBallotActivity');
		try {
			this.#publish(meetingId, {
				...update,
				...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
			});
			timingEnd(timing, 'ballot.publishBallotActivity', startedAt, 'success');
		} catch (error) {
			timingEnd(timing, 'ballot.publishBallotActivity', startedAt, 'error');
			throw error;
		}
	}

	#flush(meetingId: MeetingId) {
		const pending = this.#pending.get(meetingId);
		if (!pending) return;

		this.#pending.delete(meetingId);

		const channel = this.#channels.get(meetingId);
		if (!channel) {
			return;
		}

		const { revision, ballotActivity, sourceCorrelationId, timer } = pending;

		if (timer) {
			clearTimeout(timer);
		}

		const remove = new Set<SubscriberId>();

		for (const subscriber of [...channel.values()]) {
			try {
				const receivesBallotActivity = subscriber.options.ballotActivity === true;
				if (revision === undefined && !receivesBallotActivity) continue;

				if (revision === undefined) {
					subscriber.subscribeFn({
						kind: 'ballot-activity',
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					});
				} else {
					subscriber.subscribeFn({
						kind: 'revision',
						revision,
						ballotActivity: ballotActivity && receivesBallotActivity,
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					});
				}
			} catch {
				remove.add(subscriber.id);
			}
		}

		for (const subscriberId of remove) {
			this.#delete(meetingId, subscriberId);
		}
	}

	#delete(channelId: MeetingId, subscriberId: SubscriberId) {
		const channel = this.#channels.get(channelId);

		if (!channel) {
			return;
		}

		channel.delete(subscriberId);

		if (channel.size === 0) {
			this.#deleteChannel(channelId);
		}
	}

	#deleteChannel(channelId: MeetingId) {
		this.#channels.delete(channelId);

		const pending = this.#pending.get(channelId);
		if (pending) {
			clearTimeout(pending.timer);
			this.#pending.delete(channelId);
		}
	}
}

export const meetingPubSub = new MeetingPubSub();
