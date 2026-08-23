import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from './relations';

export function createDatabase(url: string) {
	const client = postgres(url);
	const db = drizzle({ client, relations });

	return { client, db };
}
