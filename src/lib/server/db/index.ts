import { createDatabase } from '#lib/server/db/create-db.js';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';

if (!building && !DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

export const { client, db } = createDatabase(DATABASE_URL);
