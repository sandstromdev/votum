import { describe, expect, it } from 'vitest';
import { parseConfig } from '../load-test/config.js';
import { percentile, summarizeSamples } from '../load-test/report.js';

describe('load-test config', () => {
	it('parses flags, normalizes the base URL, and preserves phase settings', () => {
		const result = parseConfig([
			'--base-url=https://votum.example/',
			'--meeting-locator',
			'ar4m7x2q',
			'--users',
			'150',
			'--ramp-ms',
			'30000',
			'--submit-ramp-ms=120000',
			'--hold-ms',
			'60000',
			'--read-percent',
			'40',
			'--replace-percent',
			'20',
			'--withdraw-percent',
			'10',
			'--timeout-ms',
			'10000',
			'--report-file',
			'report.json',
			'--headed',
			'--allow-writes'
		]);

		expect(result).toEqual({
			kind: 'config',
			config: {
				baseUrl: 'https://votum.example',
				meetingLocator: 'ar4m7x2q',
				users: 150,
				rampMs: 30000,
				submitRampMs: 120000,
				holdMs: 60000,
				readPercent: 40,
				replacePercent: 20,
				withdrawPercent: 10,
				timeoutMs: 10000,
				headless: false,
				dryRun: false,
				allowWrites: true,
				reportFile: 'report.json'
			}
		});
	});

	it('uses environment fallbacks and lets explicit flags win', () => {
		const result = parseConfig(['--users', '8', '--dry-run'], {
			LOAD_TEST_BASE_URL: 'http://localhost:3000',
			LOAD_TEST_MEETING_LOCATOR: 'env-locator',
			LOAD_TEST_USERS: '12',
			LOAD_TEST_SUBMIT_RAMP_MS: '5000',
			LOAD_TEST_REPORT_FILE: 'env-report.json'
		});

		expect(result.kind).toBe('config');
		if (result.kind !== 'config') return;
		expect(result.config.users).toBe(8);
		expect(result.config.meetingLocator).toBe('env-locator');
		expect(result.config.submitRampMs).toBe(5000);
		expect(result.config.reportFile).toBe('env-report.json');
		expect(result.config.dryRun).toBe(true);
	});

	it('returns help without requiring a target meeting', () => {
		const result = parseConfig(['--help']);

		expect(result.kind).toBe('help');
		if (result.kind !== 'help') return;
		expect(result.usage).toContain('Examples:');
	});

	it.each([
		[['--users', '0'], '--users must be an integer'],
		[['--read-percent', '101'], '--read-percent must be between 0 and 100'],
		[
			['--read-percent', '80', '--replace-percent', '20', '--withdraw-percent', '1'],
			'must not exceed 100'
		],
		[['--unknown'], 'Invalid command-line arguments']
	] as const)('rejects invalid input %j', (tokens, message) => {
		expect(() =>
			parseConfig(tokens, {
				LOAD_TEST_BASE_URL: 'http://localhost:3000',
				LOAD_TEST_MEETING_LOCATOR: 'env-locator',
				LOAD_TEST_REPORT_FILE: 'report.json'
			})
		).toThrow(message);
	});
});

describe('load-test reporting helpers', () => {
	it('calculates percentiles from sorted samples', () => {
		expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
		expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
		expect(percentile([], 0.95)).toBe(0);
	});

	it('summarizes successes and failures without changing operation names', () => {
		const result = summarizeSamples([
			{ operation: 'submit', durationMs: 10, outcome: 'success' },
			{ operation: 'submit', durationMs: 30, outcome: 'success' },
			{ operation: 'submit', durationMs: 20, outcome: 'failure', error: 'timed out' }
		]);

		expect(result.summaries).toEqual([
			{
				operation: 'submit',
				count: 3,
				successes: 2,
				failures: 1,
				p50Ms: 10,
				p95Ms: 30,
				p99Ms: 30
			}
		]);
		expect(result.failures).toEqual([{ operation: 'submit', durationMs: 20, error: 'timed out' }]);
	});
});
