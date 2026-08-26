import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { Config } from './types.js';

export const DEFAULTS = {
	users: 25,
	rampMs: 10_000,
	submitRampMs: 0,
	holdMs: 30_000,
	readPercent: 50,
	replacePercent: 20,
	withdrawPercent: 10,
	timeoutMs: 30_000
} as const;

const options = {
	'base-url': { type: 'string' },
	'meeting-locator': { type: 'string' },
	users: { type: 'string' },
	'ramp-ms': { type: 'string' },
	'submit-ramp-ms': { type: 'string' },
	'hold-ms': { type: 'string' },
	'read-percent': { type: 'string' },
	'replace-percent': { type: 'string' },
	'withdraw-percent': { type: 'string' },
	'timeout-ms': { type: 'string' },
	'report-file': { type: 'string' },
	headed: { type: 'boolean' },
	'dry-run': { type: 'boolean' },
	'allow-writes': { type: 'boolean' },
	help: { type: 'boolean' }
} satisfies ParseArgsConfig['options'];

type CliValues = Record<string, string | boolean | undefined>;
type Environment = Readonly<Record<string, string | undefined>>;

export type ConfigParseResult =
	{ kind: 'help'; usage: string } | { kind: 'config'; config: Config };

export function usageText() {
	return `Usage:
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
`;
}

function defaultReportFile() {
	const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
	return `load-test-report-${timestamp}.json`;
}

function readString(
	flags: CliValues,
	name: string,
	environmentName: string,
	required: boolean,
	environment: Environment
) {
	const flagValue = flags[name];
	const value = typeof flagValue === 'string' ? flagValue : environment[environmentName];
	if (!value?.trim() && required) {
		throw new Error(
			`Missing --${name}. Set ${environmentName} or pass --${name}. Use --help for an example.`
		);
	}
	return value?.trim() ?? '';
}

function readInteger(
	flags: CliValues,
	name: string,
	environmentName: string,
	defaultValue: number,
	minimum: number,
	environment: Environment
) {
	const flagValue = flags[name];
	const rawValue = typeof flagValue === 'string' ? flagValue : environment[environmentName];
	const value = rawValue === undefined ? defaultValue : Number(rawValue);
	if (!Number.isInteger(value) || value < minimum) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minimum}.`);
	}
	return value;
}

function readPercent(
	flags: CliValues,
	name: string,
	environmentName: string,
	defaultValue: number,
	environment: Environment
) {
	const value = readInteger(flags, name, environmentName, defaultValue, 0, environment);
	if (value > 100) throw new Error(`--${name} must be between 0 and 100.`);
	return value;
}

function parseValues(tokens: readonly string[]) {
	try {
		return parseArgs({ args: tokens, options, allowPositionals: false, strict: true }).values;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid command-line arguments: ${message} Use --help for usage.`, {
			cause: error
		});
	}
}

export function parseConfig(
	tokens: readonly string[],
	environment: Environment = process.env
): ConfigParseResult {
	const flags: CliValues = parseValues(tokens);
	if (flags.help === true) return { kind: 'help', usage: usageText() };

	const baseUrl = readString(flags, 'base-url', 'LOAD_TEST_BASE_URL', true, environment);
	const meetingLocator = readString(
		flags,
		'meeting-locator',
		'LOAD_TEST_MEETING_LOCATOR',
		true,
		environment
	);
	let parsedBaseUrl: URL;
	try {
		parsedBaseUrl = new URL(baseUrl);
	} catch {
		throw new Error('--base-url must be a valid URL.');
	}
	if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
		throw new Error('--base-url must use http or https.');
	}

	const users = readInteger(flags, 'users', 'LOAD_TEST_USERS', DEFAULTS.users, 1, environment);
	const rampMs = readInteger(
		flags,
		'ramp-ms',
		'LOAD_TEST_RAMP_MS',
		DEFAULTS.rampMs,
		0,
		environment
	);
	const submitRampMs = readInteger(
		flags,
		'submit-ramp-ms',
		'LOAD_TEST_SUBMIT_RAMP_MS',
		DEFAULTS.submitRampMs,
		0,
		environment
	);
	const holdMs = readInteger(
		flags,
		'hold-ms',
		'LOAD_TEST_HOLD_MS',
		DEFAULTS.holdMs,
		0,
		environment
	);
	const readPercentSetting = readPercent(
		flags,
		'read-percent',
		'LOAD_TEST_READ_PERCENT',
		DEFAULTS.readPercent,
		environment
	);
	const replacePercent = readPercent(
		flags,
		'replace-percent',
		'LOAD_TEST_REPLACE_PERCENT',
		DEFAULTS.replacePercent,
		environment
	);
	const withdrawPercent = readPercent(
		flags,
		'withdraw-percent',
		'LOAD_TEST_WITHDRAW_PERCENT',
		DEFAULTS.withdrawPercent,
		environment
	);
	if (readPercentSetting + replacePercent + withdrawPercent > 100) {
		throw new Error('read-percent + replace-percent + withdraw-percent must not exceed 100.');
	}

	const dryRun = flags['dry-run'] === true;
	const allowWrites = flags['allow-writes'] === true;
	if (!dryRun && !allowWrites) {
		throw new Error(
			'Ballot writes are disabled by default. Add --allow-writes when targeting a dedicated test Meeting.'
		);
	}

	return {
		kind: 'config',
		config: {
			baseUrl: parsedBaseUrl.toString().replace(/\/$/, ''),
			meetingLocator,
			users,
			rampMs,
			submitRampMs,
			holdMs,
			readPercent: readPercentSetting,
			replacePercent,
			withdrawPercent,
			timeoutMs: readInteger(
				flags,
				'timeout-ms',
				'LOAD_TEST_TIMEOUT_MS',
				DEFAULTS.timeoutMs,
				1,
				environment
			),
			headless: flags.headed !== true,
			dryRun,
			allowWrites,
			reportFile:
				readString(flags, 'report-file', 'LOAD_TEST_REPORT_FILE', false, environment) ||
				defaultReportFile()
		}
	};
}
