/// <reference types="node" />
// @ts-check

import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';
import { z } from 'zod';

const configSchema = z.object({
	databaseUrl: z.url().startsWith('postgres'),
	email: z.email('SETUP_USER_EMAIL must be a valid email address.'),
	password: z.string().min(12, 'SETUP_USER_PASSWORD must be at least 12 characters.'),
	name: z.string().min(1, 'SETUP_USER_NAME must not be empty.')
});

const config = configSchema.parse({
	databaseUrl: process.env.DATABASE_URL ?? 'postgres://root:mysecretpassword@localhost:5432/local',
	email: process.env.SETUP_USER_EMAIL,
	password: process.env.SETUP_USER_PASSWORD,
	name: process.env.SETUP_USER_NAME
});

const passwordHash = await hashPassword(config.password);
const client = postgres(config.databaseUrl);

try {
	const result = await client.begin(async (tx) => {
		const userId = randomUUID();
		await tx`
			insert into "user" ("id", "name", "email", "email_verified", "role")
			values (${userId}, ${config.name}, ${config.email}, true, 'user')
		`;
		await tx`
			insert into "account" ("id", "issuer", "account_id", "provider_id", "user_id", "password", "updated_at")
			values (${randomUUID()}, 'local:credential', ${userId}, 'credential', ${userId}, ${passwordHash}, ${new Date()})
		`;

		return 'created';
	});

	console.log(result === 'created' ? 'User created successfully.' : 'User creation failed.');
} finally {
	await client.end();
}
