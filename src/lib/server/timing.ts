import { randomUUID } from 'node:crypto';

export type TimingOutcome = 'success' | 'error';

export type TimingEvent = Readonly<{
	type: 'votum.timing';
	phase: 'start' | 'end';
	operation: string;
	correlationId: string;
	sourceCorrelationId?: string;
	durationMs?: number;
	outcome?: TimingOutcome;
}>;

export type TimingSink = (event: TimingEvent) => void;

export type TimingContext = Readonly<{
	correlationId: string;
	sink?: TimingSink;
}>;

export function createTimingContext(sink?: TimingSink): TimingContext {
	return { correlationId: randomUUID(), sink };
}

function timingsEnabled() {
	return process.env.VOTUM_TIMINGS === '1';
}

function emit(context: TimingContext, event: TimingEvent) {
	if (!timingsEnabled()) return;
	if (context.sink) {
		context.sink(event);
		return;
	}
	console.info(JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
}

export function timingStart(
	context: TimingContext,
	operation: string,
	sourceCorrelationId?: string
) {
	const startedAt = performance.now();
	emit(context, {
		type: 'votum.timing',
		phase: 'start',
		operation,
		correlationId: context.correlationId,
		...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
	});
	return startedAt;
}

export function timingEnd(
	context: TimingContext,
	operation: string,
	startedAt: number,
	outcome: TimingOutcome,
	sourceCorrelationId?: string
) {
	emit(context, {
		type: 'votum.timing',
		phase: 'end',
		operation,
		correlationId: context.correlationId,
		durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
		outcome,
		...(sourceCorrelationId === undefined ? {} : { sourceCorrelationId })
	});
}

export async function withTiming<T>(
	context: TimingContext,
	operation: string,
	action: () => Promise<T>,
	sourceCorrelationId?: string
): Promise<T> {
	const startedAt = timingStart(context, operation, sourceCorrelationId);
	try {
		const value = await action();
		timingEnd(context, operation, startedAt, 'success', sourceCorrelationId);
		return value;
	} catch (error) {
		timingEnd(context, operation, startedAt, 'error', sourceCorrelationId);
		throw error;
	}
}
