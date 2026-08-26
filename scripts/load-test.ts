import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

type FormPhaseOperation = `${'submit' | 'replace'}_${'choice' | 'request' | 'stabilization'}`;
type OperationName =
	| 'initial_read'
	| 'presentation_read'
	| 'submit'
	| 'read'
	| 'replace'
	| 'withdraw'
	| FormPhaseOperation;

type Sample =
	| { operation: OperationName; durationMs: number; outcome: 'success' }
	| { operation: OperationName; durationMs: number; outcome: 'failure'; error: string };

type Config = {
	baseUrl: string;
	meetingLocator: string;
	users: number;
	rampMs: number;
	submitRampMs: number;
	holdMs: number;
	readPercent: number;
	replacePercent: number;
	withdrawPercent: number;
	timeoutMs: number;
	headless: boolean;
	dryRun: boolean;
	allowWrites: boolean;
	reportFile: string;
};

type Participant = {
	index: number;
	context: BrowserContext;
	page: Page;
	ballotSubmitted: boolean;
};

type ActionResult<T> = { outcome: 'success'; value: T } | { outcome: 'failure'; error: unknown };

type OperationSummary = {
	operation: OperationName;
	count: number;
	successes: number;
	failures: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
};

type Report = {
	version: 1;
	status: 'ok' | 'failed' | 'dry-run';
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	reportFile: string;
	baseUrl: string;
	meetingLocator: string;
	requestedUsers: number;
	connectedParticipants: number;
	config: {
		rampMs: number;
		submitRampMs: number;
		holdMs: number;
		readPercent: number;
		replacePercent: number;
		withdrawPercent: number;
		timeoutMs: number;
		headless: boolean;
		allowWrites: boolean;
	};
	operations: OperationSummary[];
	samples: Sample[];
	failures: Array<{ operation: OperationName; durationMs: number; error: string }>;
	fatalError: string | null;
};

const DEFAULTS = {
	users: 25,
	rampMs: 10_000,
	submitRampMs: 0,
	holdMs: 30_000,
	readPercent: 50,
	replacePercent: 20,
	withdrawPercent: 10,
	timeoutMs: 30_000
} as const;

function printUsage() {
	console.info(`Usage:
  bun run load:test -- --base-url https://votum.example --meeting-locator ar4m7x2q --users 50 --allow-writes

Required:
  --base-url URL              Hosted app URL. LOAD_TEST_BASE_URL also works.
  --meeting-locator LOCATOR   Dedicated load-test Meeting locator.
  --allow-writes              Explicitly authorize Ballot writes.

Options:
  --users N                   Participant browser contexts (default: ${DEFAULTS.users}).
  --ramp-ms N                 Time to ramp all participants (default: ${DEFAULTS.rampMs}).
  --submit-ramp-ms N          Time to stagger initial Ballot submissions (default: ${DEFAULTS.submitRampMs}; 0 = burst).
  --hold-ms N                 Time to keep live clients and stagger follow-up work (default: ${DEFAULTS.holdMs}).
  --read-percent N            Participants that reload during hold (default: ${DEFAULTS.readPercent}).
  --replace-percent N         Participants that replace their Ballot (default: ${DEFAULTS.replacePercent}).
  --withdraw-percent N        Participants that withdraw their Ballot (default: ${DEFAULTS.withdrawPercent}).
  --timeout-ms N              Per-page Playwright timeout (default: ${DEFAULTS.timeoutMs}).
  --report-file PATH          JSON report path (default: timestamped load-test-report-*.json).
  --headed                    Show the browser. Avoid for larger runs.
  --dry-run                   Validate and print the plan without opening a browser.
  --help                     Show this help.

Submit reports keep the overall submit sample and add submit_choice, submit_request, and
submit_stabilization phase samples. Set VOTUM_TIMINGS=1 on the app for server timing logs.

Examples:
  bun run load:test -- --dry-run --base-url https://votum.example --meeting-locator ar4m7x2q --users 100
  bun run load:test -- --base-url https://votum.example --meeting-locator ar4m7x2q --users 50 --ramp-ms 30000 --allow-writes
`);
}

function parseFlags(tokens: readonly string[]) {
	const flags = new Map<string, string | boolean>();

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token?.startsWith('--')) {
			throw new Error(`Unexpected argument ${token ?? '<missing>'}. Use --help for usage.`);
		}

		const equalsIndex = token.indexOf('=');
		if (equalsIndex >= 0) {
			const name = token.slice(2, equalsIndex);
			const value = token.slice(equalsIndex + 1);
			if (!name || !value) throw new Error(`Invalid flag ${token}.`);
			flags.set(name, value);
			continue;
		}

		const name = token.slice(2);
		if (!name) throw new Error(`Invalid flag ${token}.`);

		const next = tokens[index + 1];
		if (next && !next.startsWith('--')) {
			flags.set(name, next);
			index += 1;
		} else {
			flags.set(name, true);
		}
	}

	return flags;
}

function readString(
	flags: Map<string, string | boolean>,
	name: string,
	environmentName: string,
	required: boolean
) {
	const flagValue = flags.get(name);
	const value = typeof flagValue === 'string' ? flagValue : process.env[environmentName];
	if (!value?.trim() && required) {
		throw new Error(
			`Missing --${name}. Set ${environmentName} or pass --${name}. Use --help for an example.`
		);
	}
	return value?.trim() ?? '';
}

function readInteger(
	flags: Map<string, string | boolean>,
	name: string,
	environmentName: string,
	defaultValue: number,
	minimum: number
) {
	const flagValue = flags.get(name);
	const rawValue = typeof flagValue === 'string' ? flagValue : process.env[environmentName];
	const value = rawValue === undefined ? defaultValue : Number(rawValue);
	if (!Number.isInteger(value) || value < minimum) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minimum}.`);
	}
	return value;
}

function readPercent(
	flags: Map<string, string | boolean>,
	name: string,
	environmentName: string,
	defaultValue: number
) {
	const value = readInteger(flags, name, environmentName, defaultValue, 0);
	if (value > 100) throw new Error(`--${name} must be between 0 and 100.`);
	return value;
}

function parseConfig(tokens: readonly string[]): Config {
	const flags = parseFlags(tokens);
	if (flags.has('help')) {
		printUsage();
		process.exit(0);
	}

	const baseUrl = readString(flags, 'base-url', 'LOAD_TEST_BASE_URL', true);
	const meetingLocator = readString(flags, 'meeting-locator', 'LOAD_TEST_MEETING_LOCATOR', true);
	const parsedBaseUrl = new URL(baseUrl);
	if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
		throw new Error('--base-url must use http or https.');
	}

	const users = readInteger(flags, 'users', 'LOAD_TEST_USERS', DEFAULTS.users, 1);
	const rampMs = readInteger(flags, 'ramp-ms', 'LOAD_TEST_RAMP_MS', DEFAULTS.rampMs, 0);
	const submitRampMs = readInteger(
		flags,
		'submit-ramp-ms',
		'LOAD_TEST_SUBMIT_RAMP_MS',
		DEFAULTS.submitRampMs,
		0
	);
	const holdMs = readInteger(flags, 'hold-ms', 'LOAD_TEST_HOLD_MS', DEFAULTS.holdMs, 0);
	const readPercentSetting = readPercentValue(flags);
	const replacePercent = readPercent(
		flags,
		'replace-percent',
		'LOAD_TEST_REPLACE_PERCENT',
		DEFAULTS.replacePercent
	);
	const withdrawPercent = readPercent(
		flags,
		'withdraw-percent',
		'LOAD_TEST_WITHDRAW_PERCENT',
		DEFAULTS.withdrawPercent
	);
	if (readPercentSetting + replacePercent + withdrawPercent > 100) {
		throw new Error('read-percent + replace-percent + withdraw-percent must not exceed 100.');
	}

	const dryRun = flags.get('dry-run') === true;
	const allowWrites = flags.get('allow-writes') === true;
	if (!dryRun && !allowWrites) {
		throw new Error(
			'Ballot writes are disabled by default. Add --allow-writes when targeting a dedicated test Meeting.'
		);
	}

	return {
		baseUrl: parsedBaseUrl.toString().replace(/\/$/, ''),
		meetingLocator,
		users,
		rampMs,
		submitRampMs,
		holdMs,
		readPercent: readPercentSetting,
		replacePercent,
		withdrawPercent,
		timeoutMs: readInteger(flags, 'timeout-ms', 'LOAD_TEST_TIMEOUT_MS', DEFAULTS.timeoutMs, 1),
		headless: flags.get('headed') !== true,
		dryRun,
		allowWrites,
		reportFile:
			readString(flags, 'report-file', 'LOAD_TEST_REPORT_FILE', false) || defaultReportFile()
	};
}

function defaultReportFile() {
	const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
	return `load-test-report-${timestamp}.json`;
}

function readPercentValue(flags: Map<string, string | boolean>) {
	return readPercent(flags, 'read-percent', 'LOAD_TEST_READ_PERCENT', DEFAULTS.readPercent);
}

function sleep(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function sleepUntil(timestamp: number) {
	const remaining = timestamp - Date.now();
	if (remaining > 0) await sleep(remaining);
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function meetingUrl(config: Config, kind: 'm' | 'p') {
	return `${config.baseUrl}/${kind}/${encodeURIComponent(config.meetingLocator)}`;
}

async function measure<T>(
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

async function measureOrThrow<T>(
	samples: Sample[],
	operation: OperationName,
	action: () => Promise<T>
) {
	const result = await measure(samples, operation, action);
	if (result.outcome === 'failure') throw result.error;
	return result.value;
}

function ballotButton(page: Page) {
	return page.getByRole('button', { name: /^(Lämna|Uppdatera).*röst$/ });
}

async function waitForActiveVote(page: Page, timeoutMs: number) {
	await page.locator('form').first().waitFor({ state: 'visible', timeout: timeoutMs });
	await ballotButton(page).first().waitFor({ state: 'visible', timeout: timeoutMs });
}

async function choiceControlState(page: Page) {
	const radios = page.getByRole('radio');
	const radioStates: string[] = [];
	for (let index = 0; index < (await radios.count()); index += 1) {
		radioStates.push(
			(await radios.nth(index).getAttribute('aria-checked')) ??
				(await radios.nth(index).getAttribute('data-state')) ??
				'unknown'
		);
	}

	const checkboxes = page.getByRole('checkbox');
	const checkboxStates: string[] = [];
	for (let index = 0; index < (await checkboxes.count()); index += 1) {
		checkboxStates.push(
			(await checkboxes.nth(index).getAttribute('aria-checked')) ??
				(await checkboxes.nth(index).getAttribute('data-state')) ??
				'unknown'
		);
	}

	const submitButton = ballotButton(page).first();
	return JSON.stringify({
		radios: radioStates,
		checkboxes: checkboxStates,
		submitDisabled: await submitButton.isDisabled()
	});
}

async function waitForEnabled(page: Page, timeoutMs: number) {
	const submitButton = ballotButton(page).first();
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await submitButton.isEnabled()) return true;
		await sleep(50);
	}
	return false;
}

async function chooseBallot(page: Page, alternative: boolean, timeoutMs: number) {
	let lastState = 'unknown';
	const attempts = 5;
	const attemptTimeoutMs = Math.min(1_000, Math.max(100, Math.floor(timeoutMs / attempts)));

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const radios = page.getByRole('radio');
		const radioCount = await radios.count();
		if (radioCount > 0) {
			const index = alternative && radioCount > 1 ? 1 : 0;
			await radios.nth(index).click();
		} else {
			const checkboxes = page.getByRole('checkbox');
			const checkboxCount = await checkboxes.count();
			if (checkboxCount === 0) throw new Error('No ballot choice control was found.');
			const index = alternative && checkboxCount > 1 ? 1 : 0;
			await checkboxes.nth(index).click();
		}

		if (await waitForEnabled(page, attemptTimeoutMs)) return;
		lastState = await choiceControlState(page);
		await sleep(50);
	}

	throw new Error(
		`Ballot choice did not enable submit button after ${attempts} attempts. ${lastState}`
	);
}

async function submitBallot(
	page: Page,
	timeoutMs: number,
	alternative: boolean,
	samples: Sample[],
	operation: 'submit' | 'replace'
) {
	await measureOrThrow(samples, `${operation}_choice`, () =>
		chooseBallot(page, alternative, timeoutMs)
	);

	await measureOrThrow(samples, `${operation}_request`, async () => {
		const [response] = await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'POST', {
				timeout: timeoutMs
			}),
			ballotButton(page).first().click({ timeout: timeoutMs })
		]);
		if (!response.ok()) {
			throw new Error(`Ballot form request failed with HTTP ${response.status()}.`);
		}
	});

	await measureOrThrow(samples, `${operation}_stabilization`, () =>
		page
			.getByRole('button', { name: /^Ta tillbaka/ })
			.first()
			.waitFor({ state: 'visible', timeout: timeoutMs })
	);
}

async function readParticipant(page: Page, timeoutMs: number) {
	await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
	await waitForActiveVote(page, timeoutMs);
}

async function replaceBallot(page: Page, timeoutMs: number, samples: Sample[]) {
	await submitBallot(page, timeoutMs, true, samples, 'replace');
}

async function withdrawBallot(page: Page, timeoutMs: number) {
	await page
		.getByRole('button', { name: /^Ta tillbaka/ })
		.first()
		.click({ timeout: timeoutMs });
	await page
		.getByRole('button', { name: /^(Lämna).*röst$/ })
		.first()
		.waitFor({
			state: 'visible',
			timeout: timeoutMs
		});
}

async function createParticipant(
	browser: Browser,
	config: Config,
	samples: Sample[],
	index: number
): Promise<Participant | undefined> {
	const result = await measure(samples, 'initial_read', async () => {
		let context: BrowserContext | undefined;
		try {
			context = await browser.newContext();
			const page = await context.newPage();
			page.setDefaultTimeout(config.timeoutMs);
			await page.goto(meetingUrl(config, 'm'), {
				waitUntil: 'domcontentloaded',
				timeout: config.timeoutMs
			});
			await waitForActiveVote(page, config.timeoutMs);
			return { index, context, page, ballotSubmitted: false } satisfies Participant;
		} catch (error) {
			await context?.close().catch(() => undefined);
			throw error;
		}
	});

	return result.outcome === 'success' ? result.value : undefined;
}

async function openPresentation(
	browser: Browser,
	config: Config,
	samples: Sample[]
): Promise<BrowserContext | undefined> {
	const result = await measure(samples, 'presentation_read', async () => {
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			page.setDefaultTimeout(config.timeoutMs);
			await page.goto(meetingUrl(config, 'p'), {
				waitUntil: 'domcontentloaded',
				timeout: config.timeoutMs
			});
			await page.getByRole('main').waitFor({ state: 'visible', timeout: config.timeoutMs });
			return context;
		} catch (error) {
			await context.close().catch(() => undefined);
			throw error;
		}
	});

	return result.outcome === 'success' ? result.value : undefined;
}

async function submitInitialBallots(
	participants: Participant[],
	config: Config,
	samples: Sample[]
) {
	const startedAt = Date.now();
	await Promise.all(
		participants.map(async (participant, index) => {
			const scheduledAt =
				startedAt +
				Math.round((config.submitRampMs * index) / Math.max(1, participants.length - 1));
			await sleepUntil(scheduledAt);
			const result = await measure(samples, 'submit', () =>
				submitBallot(participant.page, config.timeoutMs, false, samples, 'submit')
			);
			participant.ballotSubmitted = result.outcome === 'success';
		})
	);
}

async function runHoldActions(participants: Participant[], config: Config, samples: Sample[]) {
	const startedAt = Date.now();
	const participantCount = participants.length;
	const replaceLimit = config.withdrawPercent + config.replacePercent;

	await Promise.all(
		participants.map(async (participant, index) => {
			const scheduledAt =
				startedAt + Math.round((config.holdMs * (index + 1)) / (participantCount + 1));
			await sleepUntil(scheduledAt);

			const bucket = (index * 37) % 100;
			if (bucket < config.withdrawPercent) {
				if (!participant.ballotSubmitted) return;
				await measure(samples, 'withdraw', () =>
					withdrawBallot(participant.page, config.timeoutMs)
				);
				return;
			}

			if (bucket < replaceLimit) {
				if (!participant.ballotSubmitted) return;
				await measure(samples, 'replace', () =>
					replaceBallot(participant.page, config.timeoutMs, samples)
				);
				return;
			}

			if (bucket < replaceLimit + config.readPercent) {
				await measure(samples, 'read', () => readParticipant(participant.page, config.timeoutMs));
			}
		})
	);
}

function percentile(values: number[], fraction: number) {
	if (values.length === 0) return 0;
	const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);
	return values[index] ?? 0;
}

function summarizeSamples(samples: Sample[]) {
	const operations = [...new Set(samples.map((sample) => sample.operation))].sort();
	const summaries = operations.map((operation) => {
		const operationSamples = samples.filter((sample) => sample.operation === operation);
		const durations = operationSamples
			.filter(
				(sample): sample is Extract<Sample, { outcome: 'success' }> => sample.outcome === 'success'
			)
			.map((sample) => sample.durationMs)
			.sort((a, b) => a - b);
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

function createReport(
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

async function writeReport(report: Report) {
	await mkdir(dirname(report.reportFile), { recursive: true });
	await writeFile(report.reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printSummary(report: Report) {
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

async function run(config: Config) {
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
			if (participant) participants.push(participant);
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
			participants.map((participant) => participant.context.close().catch(() => undefined))
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

	if (reportError)
		throw new Error(`Could not write report ${reportFile}: ${errorMessage(reportError)}`);
	if (fatalError) throw fatalError;
	if (samples.some((sample) => sample.outcome === 'failure')) {
		throw new Error('Load test completed with failed operations.');
	}
}

try {
	const config = parseConfig(process.argv.slice(2));
	await run(config);
} catch (error) {
	console.error(`Load test failed: ${errorMessage(error)}`);
	process.exitCode = 1;
}
