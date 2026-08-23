import { describe, expect, it } from 'vitest';
import {
	allowRemoteDatabaseFlag,
	assertSafeDatabaseUrl,
	hasAllowRemoteDatabaseFlag
} from './database-safety.js';

describe('assertSafeDatabaseUrl', () => {
	it.each(['localhost', '127.0.0.1', '[::1]'])('allows local database host %s', (host) => {
		expect(() =>
			assertSafeDatabaseUrl({ databaseUrl: `postgres://user:password@${host}:5432/database` })
		).not.toThrow();
	});

	it('rejects remote database hosts by default', () => {
		expect(() =>
			assertSafeDatabaseUrl({
				databaseUrl: 'postgres://user:password@db.example.com:5432/database'
			})
		).toThrow(
			`Refusing to use remote database at db.example.com. Use ${allowRemoteDatabaseFlag} only when this is intentional.`
		);
	});

	it('allows a remote database host with explicit opt-in', () => {
		expect(() =>
			assertSafeDatabaseUrl({
				databaseUrl: 'postgres://user:password@db.example.com:5432/database',
				allowRemote: true
			})
		).not.toThrow();
	});

	it.each([
		['undefined', undefined],
		['malformed', 'not a database URL'],
		['wrong protocol', 'https://localhost/database'],
		['missing host', 'postgres:///database']
	] as const)('rejects %s database URLs', (_description, databaseUrl) => {
		expect(() => assertSafeDatabaseUrl({ databaseUrl })).toThrow();
	});
});

describe('hasAllowRemoteDatabaseFlag', () => {
	it('recognizes the explicit remote database flag', () => {
		expect(hasAllowRemoteDatabaseFlag(['--verbose', allowRemoteDatabaseFlag])).toBe(true);
	});

	it('does not infer permission from unrelated arguments', () => {
		expect(hasAllowRemoteDatabaseFlag(['--allow-remote-ish'])).toBe(false);
	});
});
