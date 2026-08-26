import {
	createTimingContext,
	timingEnd,
	timingStart,
	type TimingContext
} from '#lib/server/timing.js';
import { VOTUM_LIVE_UPDATE_DEBOUNCE_MS } from '$app/env/private';

type MeetingId = string;
type SubscriberId = string;

export type MeetingUpdate =
	| {
			kind: 'revision';
			revision: number;
			ballotActivity: boolean;
			participantTokenHashes: readonly string[];
			sourceCorrelationId?: string;
	  }
	| {
			kind: 'ballot-activity';
			participantTokenHashes: readonly string[];
			sourceCorrelationId?: string;
	  };

export type MeetingSubscriptionOptions = {
	participantTokenHash?: string | null;
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
		participantTokenHashes: Set<string>;
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
		const participantTokenHashes = new Set<string>();
		let sourceCorrelationId: string | undefined;
		let resolveWait: (() => void) | undefined;

		function onPayload(update: MeetingUpdate) {
			for (const participantTokenHash of update.participantTokenHashes) {
				participantTokenHashes.add(participantTokenHash);
			}
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
						participantTokenHashes: [...participantTokenHashes],
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					};
				} else {
					yield {
						kind: 'revision',
						revision: latestRevision,
						ballotActivity,
						participantTokenHashes: [...participantTokenHashes],
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					};
				}
				latestRevision = undefined;
				ballotActivity = false;
				participantTokenHashes.clear();
				sourceCorrelationId = undefined;
			}
		} finally {
			unsubscribe();
			signal.removeEventListener('abort', onAbort);
		}
	}

	#publish(meetingId: MeetingId, update: MeetingUpdate) {
		const pending = this.#pending.get(meetingId);

		if (pending) {
			if (update.kind === 'revision') {
				pending.revision = Math.max(pending.revision ?? 0, update.revision);
			}
			if (update.kind === 'ballot-activity') {
				pending.ballotActivity = true;
			}
			for (const participantTokenHash of update.participantTokenHashes) {
				pending.participantTokenHashes.add(participantTokenHash);
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
			participantTokenHashes: new Set(update.participantTokenHashes),
			sourceCorrelationId: update.sourceCorrelationId,
			timer
		});
	}

	publish(meetingId: MeetingId, revision: number) {
		this.#publish(meetingId, {
			kind: 'revision',
			revision,
			ballotActivity: false,
			participantTokenHashes: []
		});
	}

	publishBallotActivity(
		meetingId: MeetingId,
		{
			participantTokenHash,
			timing: inputTiming
		}: { participantTokenHash?: string; timing?: TimingContext } = {}
	) {
		const timing = inputTiming ?? createTimingContext();
		const sourceCorrelationId = inputTiming?.correlationId;
		const startedAt = timingStart(timing, 'ballot.publishBallotActivity');
		try {
			this.#publish(meetingId, {
				kind: 'ballot-activity',
				participantTokenHashes: participantTokenHash === undefined ? [] : [participantTokenHash],
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

		const { revision, ballotActivity, participantTokenHashes, sourceCorrelationId, timer } =
			pending;
		const participantTokenHashList = [...participantTokenHashes];

		if (timer) {
			clearTimeout(timer);
		}

		const remove = new Set<SubscriberId>();

		for (const subscriber of [...channel.values()]) {
			try {
				const isTargetedParticipant = 'participantTokenHash' in subscriber.options;
				const participantTokenHash = subscriber.options.participantTokenHash;
				const receivesBallotActivity =
					!isTargetedParticipant ||
					(participantTokenHash !== null &&
						participantTokenHash !== undefined &&
						participantTokenHashes.has(participantTokenHash));
				if (revision === undefined && !receivesBallotActivity) continue;

				if (revision === undefined) {
					subscriber.subscribeFn({
						kind: 'ballot-activity',
						participantTokenHashes: participantTokenHashList,
						...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
					});
				} else {
					subscriber.subscribeFn({
						kind: 'revision',
						revision,
						ballotActivity: ballotActivity && receivesBallotActivity,
						participantTokenHashes: participantTokenHashList,
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
