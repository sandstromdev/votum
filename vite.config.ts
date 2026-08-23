import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

// Vitest loads SvelteKit as real ESM. Kit then imports
// `<sveltekit:generated>/server.js`, a Vite alias that Node cannot resolve.
// Map it for tests. Production builds keep the SvelteKit plugin's own alias.
const kitGeneratedDev = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'.svelte-kit/generated/dev'
);

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true }
		})
	],
	...(process.env.VITEST
		? {
				resolve: {
					alias: [{ find: '<sveltekit:generated>', replacement: kitGeneratedDev }]
				}
			}
		: {}),
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			include: ['src/lib/server/**'],
			exclude: [
				'src/lib/server/**/*.{test,spec}.{js,ts}',
				'src/lib/server/**/index.ts',
				'src/lib/server/db/schema/**',
				'src/lib/server/db/relations.ts',
				'src/lib/server/testing/**'
			],
			reporter: ['text', 'html']
		},
		projects: [
			{
				extends: './vite.config.ts',
				// Route component tests do not boot SvelteKit's client env runtime.
				define: {
					'globalThis.__sveltekit_dev': JSON.stringify({
						env: { ORIGIN: 'http://localhost:5173' }
					})
				},
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					server: {
						deps: {
							inline: ['@sveltejs/kit']
						}
					},
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/helpers/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
