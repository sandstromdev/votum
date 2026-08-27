import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { errorMessage } from './measure.js';
import type { Config, OperationSummary, Report, Sample } from './types.js';

export function percentile(values: readonly number[], fraction: number) {
	if (values.length === 0) {
		return 0;
	}
	const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);

	return values[index] ?? 0;
}

export function summarizeSamples(samples: readonly Sample[]) {
	const operations = [...new Set(samples.map((sample) => sample.operation))].toSorted();
	const summaries: OperationSummary[] = operations.map((operation) => {
		const operationSamples = samples.filter((sample) => sample.operation === operation);
		const durations = operationSamples
			.filter(
				(sample): sample is Extract<Sample, { outcome: 'success' }> => sample.outcome === 'success'
			)
			.map((sample) => sample.durationMs)
			.toSorted((a, b) => a - b);

		return {
			operation,
			count: operationSamples.length,
			successes: durations.length,
			failures: operationSamples.length - durations.length,
			p50Ms: percentile(durations, 0.5),
			p95Ms: percentile(durations, 0.95),
			p99Ms: percentile(durations, 0.99)
		};
	});

	const failures = samples
		.filter(
			(sample): sample is Extract<Sample, { outcome: 'failure' }> => sample.outcome === 'failure'
		)
		.map(({ operation, durationMs, error }) => ({ operation, durationMs, error }));

	return { summaries, failures };
}

export function createReport(
	config: Config,
	reportFile: string,
	samples: Sample[],
	participantCount: number,
	startedAt: Date,
	finishedAt: Date,
	status: Report['status'],
	fatalError: unknown
): Report {
	const { summaries, failures } = summarizeSamples(samples);

	return {
		version: 1,
		status,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: finishedAt.getTime() - startedAt.getTime(),
		reportFile,
		baseUrl: config.baseUrl,
		meetingLocator: config.meetingLocator,
		requestedUsers: config.users,
		connectedParticipants: participantCount,
		config: {
			rampMs: config.rampMs,
			submitRampMs: config.submitRampMs,
			holdMs: config.holdMs,
			readPercent: config.readPercent,
			replacePercent: config.replacePercent,
			withdrawPercent: config.withdrawPercent,
			timeoutMs: config.timeoutMs,
			headless: config.headless,
			allowWrites: config.allowWrites
		},
		operations: summaries,
		samples,
		failures,
		fatalError: fatalError ? errorMessage(fatalError) : null
	};
}

export async function writeReport(report: Report) {
	await mkdir(dirname(report.reportFile), { recursive: true });
	await writeFile(report.reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function printSummary(report: Report) {
	console.info(
		JSON.stringify(
			{
				status: report.status,
				reportFile: report.reportFile,
				baseUrl: report.baseUrl,
				meetingLocator: report.meetingLocator,
				requestedUsers: report.requestedUsers,
				connectedParticipants: report.connectedParticipants,
				operations: report.operations,
				failures: report.failures.slice(0, 20)
			},
			null,
			2
		)
	);
}
