import type { BrowserContext, Page } from 'playwright';

export type FormPhaseOperation = `${'submit' | 'replace'}_${
	'choice' | 'request' | 'stabilization'}`;

export type OperationName =
	| 'initial_read'
	| 'presentation_read'
	| 'submit'
	| 'read'
	| 'replace'
	| 'withdraw'
	| FormPhaseOperation;

export type Sample =
	| { operation: OperationName; durationMs: number; outcome: 'success' }
	| { operation: OperationName; durationMs: number; outcome: 'failure'; error: string };

export type Config = {
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

export type Participant = {
	index: number;
	context: BrowserContext;
	page: Page;
	ballotSubmitted: boolean;
};

export type ActionResult<T> =
	{ outcome: 'success'; value: T } | { outcome: 'failure'; error: unknown };

export type OperationSummary = {
	operation: OperationName;
	count: number;
	successes: number;
	failures: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
};

export type Report = {
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
