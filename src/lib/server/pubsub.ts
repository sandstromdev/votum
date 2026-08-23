type MeetingId = string;
type SubscriberId = string;

type Subscriber = {
	id: SubscriberId;
	subscribeFn: SubscribeFn;
};
type SubscribeFn = (revision: number) => void;

type ChannelMap = Map<MeetingId, Map<SubscriberId, Subscriber>>;
type PendingMap = Map<
	MeetingId,
	{
		revision: number;
		timer: NodeJS.Timeout;
	}
>;

const DEBUG_MEETING_PUBSUB = false;
const MEETING_PUBSUB_FLUSH_DELAY = 100;

class MeetingPubSub {
	#channels: ChannelMap = new Map();
	#pending: PendingMap = new Map();

	subscribe(meetingId: MeetingId, subscriber: SubscribeFn) {
		let channel = this.#channels.get(meetingId);

		if (!channel) {
			channel = new Map();
			this.#channels.set(meetingId, channel);
		}

		const subscriberId = crypto.randomUUID();
		const subscriberObj = {
			id: subscriberId,

			subscribeFn: subscriber
		} satisfies Subscriber;

		channel.set(subscriberId, subscriberObj);

		return () => {
			this.#delete(meetingId, subscriberId);
		};
	}

	async *listen(meetingId: MeetingId, signal: AbortSignal) {
		let latest: number | undefined;
		let resolveWait: (() => void) | undefined;

		function onPayload(revision: number) {
			latest = Math.max(latest ?? 0, revision);

			const resolve = resolveWait;
			resolveWait = undefined;
			resolve?.();
		}

		function onAbort() {
			const resolve = resolveWait;
			resolveWait = undefined;
			resolve?.();
		}

		const unsubscribe = this.subscribe(meetingId, onPayload);

		signal.addEventListener('abort', onAbort);

		try {
			while (!signal.aborted) {
				if (latest === undefined) {
					await new Promise<void>((resolve) => {
						resolveWait = resolve;
					});
				}

				if (signal.aborted) {
					break;
				}

				if (latest === undefined) {
					continue;
				}

				const current = latest;
				latest = undefined;

				yield current;
			}
		} finally {
			unsubscribe();
			signal.removeEventListener('abort', onAbort);
		}
	}

	publish(meetingId: MeetingId, revision: number) {
		const pending = this.#pending.get(meetingId);

		if (pending) {
			pending.revision = Math.max(pending.revision, revision);
			return;
		}

		const timer = setTimeout(() => {
			this.#flush(meetingId);
		}, MEETING_PUBSUB_FLUSH_DELAY);

		this.#pending.set(meetingId, { revision, timer });
	}

	#flush(meetingId: MeetingId) {
		const pending = this.#pending.get(meetingId);
		if (!pending) return;

		this.#pending.delete(meetingId);

		const channel = this.#channels.get(meetingId);
		if (!channel) return;

		const { revision: payload, timer } = pending;

		if (timer) {
			clearTimeout(timer);
		}

		const remove = new Set<SubscriberId>();
		let delivered = 0;
		const errors: unknown[] = [];

		for (const subscriber of [...channel.values()]) {
			try {
				subscriber.subscribeFn(payload);
				delivered++;
			} catch (error) {
				remove.add(subscriber.id);
				errors.push(error);
			}
		}

		for (const subscriberId of remove) {
			this.#delete(meetingId, subscriberId);
		}

		if (DEBUG_MEETING_PUBSUB) {
			console.log(
				`[MeetingPubSub]: flushed ${delivered} subscribers, removed ${remove.size} subscribers, errors: ${errors.length}`
			);
			if (errors.length > 0) {
				for (const error of errors) {
					console.error(error);
				}
			}
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
