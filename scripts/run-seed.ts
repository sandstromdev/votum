import { assertSafeDatabaseUrl, hasAllowRemoteDatabaseFlag } from './helpers/database-safety.js';
import { runWithVite } from './helpers/run-with-vite.js';

assertSafeDatabaseUrl({
	databaseUrl: process.env.DATABASE_URL,
	allowRemote: hasAllowRemoteDatabaseFlag(process.argv.slice(2))
});

await runWithVite('/scripts/seed-meeting.ts');
