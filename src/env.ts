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
	DATABASE_POOL_MAX: {
		schema: buildOptional(
			z.string().default('20').transform(Number).pipe(z.number().int().min(1).max(100))
		),
		description: 'Maximum PostgreSQL connections per application process (default: 20).'
	},
	VOTUM_TIMINGS: {
		schema: buildOptional(z.stringbool().default(false)),
		description: 'Set to `1` to emit structured server timing events. Unset by default.'
	},
	VOTUM_LIVE_UPDATE_DEBOUNCE_MS: {
		schema: buildOptional(
			z.string().default('500').transform(Number).pipe(z.number().int().min(50))
		),
		description: 'Live-update debounce in milliseconds (default: 500).'
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
	}
});
