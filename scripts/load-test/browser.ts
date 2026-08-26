import type { Browser, BrowserContext, Page } from 'playwright';
import { measure, measureOrThrow } from './measure.js';
import type { Config, Participant, Sample } from './types.js';

export function meetingUrl(config: Config, kind: 'm' | 'p') {
	return `${config.baseUrl}/${kind}/${encodeURIComponent(config.meetingLocator)}`;
}

function ballotButton(page: Page) {
	return page.getByRole('button', { name: /^(Lämna|Uppdatera).*röst$/ });
}

async function createContextPage(browser: Browser, timeoutMs: number) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		page.setDefaultTimeout(timeoutMs);
		return { context, page };
	} catch (error) {
		await context.close().catch(() => undefined);
		throw error;
	}
}

async function waitForActiveVote(page: Page, timeoutMs: number) {
	await page.locator('form').first().waitFor({ state: 'visible', timeout: timeoutMs });
	await ballotButton(page).first().waitFor({ state: 'visible', timeout: timeoutMs });
}

async function choiceControlState(page: Page) {
	const radios = page.getByRole('radio');
	const radioStates: string[] = [];
	for (let index = 0; index < (await radios.count()); index += 1) {
		radioStates.push(
			(await radios.nth(index).getAttribute('aria-checked')) ??
				(await radios.nth(index).getAttribute('data-state')) ??
				'unknown'
		);
	}

	const checkboxes = page.getByRole('checkbox');
	const checkboxStates: string[] = [];
	for (let index = 0; index < (await checkboxes.count()); index += 1) {
		checkboxStates.push(
			(await checkboxes.nth(index).getAttribute('aria-checked')) ??
				(await checkboxes.nth(index).getAttribute('data-state')) ??
				'unknown'
		);
	}

	const submitButton = ballotButton(page).first();
	return JSON.stringify({
		radios: radioStates,
		checkboxes: checkboxStates,
		submitDisabled: await submitButton.isDisabled()
	});
}

async function waitForEnabled(page: Page, timeoutMs: number) {
	const submitButton = ballotButton(page).first();
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await submitButton.isEnabled()) return true;
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
	}
	return false;
}

async function chooseBallot(page: Page, alternative: boolean, timeoutMs: number) {
	let lastState = 'unknown';
	const attempts = 5;
	const attemptTimeoutMs = Math.min(1_000, Math.max(100, Math.floor(timeoutMs / attempts)));

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const radios = page.getByRole('radio');
		const radioCount = await radios.count();
		if (radioCount > 0) {
			const index = alternative && radioCount > 1 ? 1 : 0;
			await radios.nth(index).click();
		} else {
			const checkboxes = page.getByRole('checkbox');
			const checkboxCount = await checkboxes.count();
			if (checkboxCount === 0) throw new Error('No ballot choice control was found.');
			const index = alternative && checkboxCount > 1 ? 1 : 0;
			await checkboxes.nth(index).click();
		}

		if (await waitForEnabled(page, attemptTimeoutMs)) return;
		lastState = await choiceControlState(page);
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
	}

	throw new Error(
		`Ballot choice did not enable submit button after ${attempts} attempts. ${lastState}`
	);
}

export async function submitBallot(
	page: Page,
	timeoutMs: number,
	alternative: boolean,
	samples: Sample[],
	operation: 'submit' | 'replace'
) {
	await measureOrThrow(samples, `${operation}_choice`, () =>
		chooseBallot(page, alternative, timeoutMs)
	);

	await measureOrThrow(samples, `${operation}_request`, async () => {
		const [response] = await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'POST', {
				timeout: timeoutMs
			}),
			ballotButton(page).first().click({ timeout: timeoutMs })
		]);
		if (!response.ok()) {
			throw new Error(`Ballot form request failed with HTTP ${response.status()}.`);
		}
	});

	await measureOrThrow(samples, `${operation}_stabilization`, () =>
		page
			.getByRole('button', { name: /^Ta tillbaka/ })
			.first()
			.waitFor({ state: 'visible', timeout: timeoutMs })
	);
}

export async function readParticipant(page: Page, timeoutMs: number) {
	await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
	await waitForActiveVote(page, timeoutMs);
}

export async function replaceBallot(page: Page, timeoutMs: number, samples: Sample[]) {
	await submitBallot(page, timeoutMs, true, samples, 'replace');
}

export async function withdrawBallot(page: Page, timeoutMs: number) {
	await page
		.getByRole('button', { name: /^Ta tillbaka/ })
		.first()
		.click({ timeout: timeoutMs });
	await page
		.getByRole('button', { name: /^(Lämna).*röst$/ })
		.first()
		.waitFor({ state: 'visible', timeout: timeoutMs });
}

export async function createParticipant(
	browser: Browser,
	config: Config,
	samples: Sample[],
	index: number
): Promise<Participant | undefined> {
	const result = await measure(samples, 'initial_read', async () => {
		let context: BrowserContext | undefined;
		try {
			const created = await createContextPage(browser, config.timeoutMs);
			context = created.context;
			const { page } = created;
			await page.goto(meetingUrl(config, 'm'), {
				waitUntil: 'domcontentloaded',
				timeout: config.timeoutMs
			});
			await waitForActiveVote(page, config.timeoutMs);
			return { index, context, page, ballotSubmitted: false } satisfies Participant;
		} catch (error) {
			await context?.close().catch(() => undefined);
			throw error;
		}
	});

	return result.outcome === 'success' ? result.value : undefined;
}

export async function openPresentation(
	browser: Browser,
	config: Config,
	samples: Sample[]
): Promise<BrowserContext | undefined> {
	const result = await measure(samples, 'presentation_read', async () => {
		const { context, page } = await createContextPage(browser, config.timeoutMs);
		try {
			await page.goto(meetingUrl(config, 'p'), {
				waitUntil: 'domcontentloaded',
				timeout: config.timeoutMs
			});
			await page.getByRole('main').waitFor({ state: 'visible', timeout: config.timeoutMs });
			return context;
		} catch (error) {
			await context.close().catch(() => undefined);
			throw error;
		}
	});

	return result.outcome === 'success' ? result.value : undefined;
}
