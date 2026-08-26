import { parseConfig } from './load-test/config.js';
import { errorMessage } from './load-test/measure.js';
import { run } from './load-test/run.js';

try {
	const result = parseConfig(process.argv.slice(2));
	if (result.kind === 'help') {
		console.info(result.usage);
	} else {
		await run(result.config);
	}
} catch (error) {
	console.error(`Load test failed: ${errorMessage(error)}`);
	process.exitCode = 1;
}
