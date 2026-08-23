export type UseRampOptions = {
	/** Called for each increment. */
	increment: () => void;
	/**
	 * Slowest interval between increments, in milliseconds.
	 * @default 200
	 */
	maxFrequency?: number;
	/**
	 * Fastest interval between increments, in milliseconds.
	 * @default 25
	 */
	minFrequency?: number;
	/**
	 * Delay before the ramp starts, in milliseconds.
	 * @default 100
	 */
	startDelay?: number;
	/**
	 * Time to reach the minimum interval, in milliseconds.
	 * @default 2500
	 */
	rampUpTime?: number;
	/** Return false to reset the ramp before the next increment. */
	canRamp: () => boolean;
};

export function useRamp({
	increment,
	maxFrequency = 200,
	minFrequency = 25,
	startDelay = 100,
	rampUpTime = 2500,
	canRamp
}: UseRampOptions) {
	let active = $state(false);
	let ramping = $state(false);
	let rampStartTimeout: ReturnType<typeof setTimeout> | undefined;
	let rampIntervalTimeout: ReturnType<typeof setTimeout> | undefined;
	let rampStartedAt: number | undefined;

	function rampUp() {
		if (!active) return;
		ramping = true;
		const timeSinceStart = Date.now() - (rampStartedAt ?? 0);
		const freq = rampUpTime === 0 ? 0 : Math.min(timeSinceStart, rampUpTime) / rampUpTime;
		if (!canRamp()) {
			reset();
			return;
		}
		increment();
		rampIntervalTimeout = setTimeout(
			() => rampUp(),
			maxFrequency - freq * (maxFrequency - minFrequency)
		);
	}

	function reset() {
		clearTimeout(rampStartTimeout);
		clearTimeout(rampIntervalTimeout);
		rampStartedAt = undefined;
		active = false;
		ramping = false;
	}

	function start() {
		active = true;
		rampStartedAt = Date.now();
		rampStartTimeout = setTimeout(() => rampUp(), startDelay);
	}

	return {
		start,
		reset,
		get active() {
			return active;
		},
		get ramping() {
			return ramping;
		}
	};
}
