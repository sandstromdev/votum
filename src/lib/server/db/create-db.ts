import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_POOL_MAX } from '$app/env/private';
import { relations } from './relations';

const DEFAULT_DATABASE_POOL_MAX = 20;

export function createDatabase(url: string) {
	const client = postgres(url, { max: DATABASE_POOL_MAX ?? DEFAULT_DATABASE_POOL_MAX });
	const db = drizzle({ client, relations });

	return { client, db };
}
