import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import z from 'zod';

function buildOptional<T extends z.ZodType>(schema: T) {
	// Env vars arrive when the container starts. During `vite build`, `building` is true so these schemas stay optional.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return building ? (z.optional(schema) as unknown as T) : schema;
}

function optionalInteger(name: string, minimum: number, maximum?: number) {
	return (value: string | undefined) => {
		if (value === undefined || value === '') return undefined;
		if (!/^\d+$/.test(value)) {
			throw new Error(`${name} must be a non-negative integer.`);
		}

		const parsed = Number(value);
		if (
			!Number.isSafeInteger(parsed) ||
			parsed < minimum ||
			(maximum !== undefined && parsed > maximum)
		) {
			const range =
				maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
			throw new Error(`${name} must be ${range}.`);
		}

		return parsed;
	};
}

export const variables = defineEnvVars({
	DATABASE_URL: {
		schema: buildOptional(z.url()),
		description: 'The database connection string.'
	},
	DATABASE_POOL_MAX: {
		schema: optionalInteger('DATABASE_POOL_MAX', 1),
		description: 'Maximum PostgreSQL connections per application process (default: 20).'
	},
	VOTUM_TIMINGS: {
		schema: buildOptional(z.enum(['0', '1'])),
		description: 'Set to `1` to emit structured server timing events. Unset by default.'
	},
	VOTUM_LIVE_UPDATE_DEBOUNCE_MS: {
		schema: optionalInteger('VOTUM_LIVE_UPDATE_DEBOUNCE_MS', 0, 60_000),
		description: 'Live-update debounce in milliseconds (default: 500; allowed range: 0–60000).'
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
