import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

export async function runWithVite(entry: string) {
	const server = await createServer({
		configFile,
		server: { middlewareMode: true }
	});

	try {
		return await server.ssrLoadModule(entry);
	} finally {
		await server.close();
	}
}
