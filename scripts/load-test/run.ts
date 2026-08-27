import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createParticipant, openPresentation } from './browser.js';
import { errorMessage, sleepUntil } from './measure.js';
import { createReport, printSummary, writeReport } from './report.js';
import { runHoldActions, submitInitialBallots } from './scenario.js';
import type { Config, Participant, Report, Sample } from './types.js';

export async function run(config: Config) {
	const startedAt = new Date();
	const reportFile = resolve(config.reportFile);
	const plan = {
		baseUrl: config.baseUrl,
		meetingLocator: config.meetingLocator,
		users: config.users,
		rampMs: config.rampMs,
		submitRampMs: config.submitRampMs,
		holdMs: config.holdMs,
		readPercent: config.readPercent,
		replacePercent: config.replacePercent,
		withdrawPercent: config.withdrawPercent,
		reportFile
	};

	if (config.dryRun) {
		const finishedAt = new Date();
		const report = createReport(config, reportFile, [], 0, startedAt, finishedAt, 'dry-run', null);

		await writeReport(report);
		console.info(JSON.stringify({ status: 'dry-run', reportFile, plan }, null, 2));

		return;
	}

	console.info(`Starting load test with ${config.users} participant browser contexts.`);
	const samples: Sample[] = [];
	let browser: Browser | undefined;
	const participants: Participant[] = [];
	let presentationContext: BrowserContext | undefined;
	let fatalError: unknown;
	let reportError: unknown;

	try {
		const launchedBrowser = await chromium.launch({ headless: config.headless });

		browser = launchedBrowser;
		presentationContext = await openPresentation(launchedBrowser, config, samples);
		const rampStartedAt = Date.now();
		const participantPromises: Array<Promise<Participant | undefined>> = [];

		for (let index = 0; index < config.users; index += 1) {
			const target =
				rampStartedAt + Math.round((config.rampMs * index) / Math.max(1, config.users - 1));

			await sleepUntil(target);
			participantPromises.push(createParticipant(launchedBrowser, config, samples, index));
		}

		const createdParticipants = await Promise.all(participantPromises);

		for (const participant of createdParticipants) {
			if (participant) {
				participants.push(participant);
			}
		}
		if (participants.length === 0) {
			throw new Error('No participant browser reached an active Vote.');
		}

		console.info(
			config.submitRampMs === 0
				? `Submitting ${participants.length} Ballots concurrently.`
				: `Submitting ${participants.length} Ballots over ${config.submitRampMs} ms.`
		);
		await submitInitialBallots(participants, config, samples);
		await runHoldActions(participants, config, samples);
	} catch (error) {
		fatalError = error;
	} finally {
		await presentationContext?.close().catch(() => undefined);
		await Promise.all(
			participants.map(async (participant) => participant.context.close().catch(() => undefined))
		);
		await browser?.close().catch(() => undefined);

		const finishedAt = new Date();
		const status: Report['status'] =
			fatalError || samples.some((sample) => sample.outcome === 'failure') ? 'failed' : 'ok';
		const report = createReport(
			config,
			reportFile,
			samples,
			participants.length,
			startedAt,
			finishedAt,
			status,
			fatalError
		);

		try {
			await writeReport(report);
		} catch (error) {
			reportError = error;
		}
		printSummary(report);
	}

	if (reportError) {
		throw new Error(`Could not write report ${reportFile}: ${errorMessage(reportError)}`);
	}
	if (fatalError) {
		throw fatalError;
	}
	if (samples.some((sample) => sample.outcome === 'failure')) {
		throw new Error('Load test completed with failed operations.');
	}
}
