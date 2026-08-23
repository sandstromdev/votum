const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1']);

export const allowRemoteDatabaseFlag = '--allow-remote';

type DatabaseSafetyOptions = {
	databaseUrl: string | undefined;
	allowRemote?: boolean;
};

function parseDatabaseUrl(databaseUrl: string | undefined) {
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.');
	}

	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
	}

	if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
		throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
	}

	if (!url.hostname) {
		throw new Error('DATABASE_URL must include a database host.');
	}

	return url;
}

function normalizedHostname(url: URL) {
	return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

export function assertSafeDatabaseUrl({ databaseUrl, allowRemote = false }: DatabaseSafetyOptions) {
	const url = parseDatabaseUrl(databaseUrl);
	if (allowRemote) return;

	const hostname = normalizedHostname(url);
	if (localDatabaseHosts.has(hostname)) return;

	throw new Error(
		`Refusing to use remote database at ${hostname}. Use ${allowRemoteDatabaseFlag} only when this is intentional.`
	);
}

export function hasAllowRemoteDatabaseFlag(args: readonly string[]) {
	return args.includes(allowRemoteDatabaseFlag);
}
