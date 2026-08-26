import type { ActionResult, OperationName, Sample } from './types.js';

export function sleep(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function sleepUntil(timestamp: number) {
	const remaining = timestamp - Date.now();
	if (remaining > 0) await sleep(remaining);
}

export function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export async function measure<T>(
	samples: Sample[],
	operation: OperationName,
	action: () => Promise<T>
): Promise<ActionResult<T>> {
	const startedAt = performance.now();
	try {
		const value = await action();
		samples.push({
			operation,
			durationMs: Math.round(performance.now() - startedAt),
			outcome: 'success'
		});
		return { outcome: 'success', value };
	} catch (error) {
		samples.push({
			operation,
			durationMs: Math.round(performance.now() - startedAt),
			outcome: 'failure',
			error: errorMessage(error)
		});
		return { outcome: 'failure', error };
	}
}

export async function measureOrThrow<T>(
	samples: Sample[],
	operation: OperationName,
	action: () => Promise<T>
) {
	const result = await measure(samples, operation, action);
	if (result.outcome === 'failure') throw result.error;
	return result.value;
}

export async function runScheduled<T>(
	items: readonly T[],
	durationMs: number,
	action: (item: T, index: number) => Promise<void>,
	position: 'endpoints' | 'gaps' = 'gaps'
) {
	const startedAt = Date.now();
	await Promise.all(
		items.map(async (item, index) => {
			const scheduledOffset =
				position === 'endpoints'
					? Math.round((durationMs * index) / Math.max(1, items.length - 1))
					: Math.round((durationMs * (index + 1)) / (items.length + 1));
			const scheduledAt = startedAt + scheduledOffset;
			await sleepUntil(scheduledAt);
			await action(item, index);
		})
	);
}
