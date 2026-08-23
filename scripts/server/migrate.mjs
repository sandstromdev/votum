import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set');
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle({ client });
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

try {
	await migrate(db, { migrationsFolder });
	console.log('Database migrations applied.');
} finally {
	await client.end();
}
