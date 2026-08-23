import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import z from 'zod';

function buildOptional<T extends z.ZodType>(schema: T) {
	// Env vars arrive when the container starts. During `vite build`, `building` is true so these schemas stay optional.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return building ? (z.optional(schema) as unknown as T) : schema;
}

export const variables = defineEnvVars({
	DATABASE_URL: {
		schema: buildOptional(z.url()),
		description: 'The database connection string.'
	},
	ORIGIN: {
		public: true,
		schema: buildOptional(z.url()),
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		schema: buildOptional(z.string()),
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	SENTRY_DSN: {
		public: true,
		schema: z.string().optional(),
		description: 'Sentry project DSN for error monitoring. Safe to expose to the browser.'
	},
	SENTRY_TRACE_SAMPLE_RATE: {
		public: true,
		schema: z.string().default('0.2').transform(Number).pipe(z.number().min(0).max(1)),
		description:
			'The sample rate for tracing. A number between 0 and 1. For example, 0.2 means 20% of transactions will be sent to Sentry.'
	}
});
