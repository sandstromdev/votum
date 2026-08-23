import { render } from 'vitest-browser-svelte';
import { expect, it, vi } from 'vitest';

vi.mock('#lib/remotes/meeting.remote.js', () => ({
	presentationMeetingLive: vi.fn()
}));
vi.mock('$app/navigation', () => ({ refreshAll: vi.fn(async () => undefined) }));

import Page from './[locator]/+page.svelte';

it('shows the waiting state without participant or Organizer controls', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'waiting',
				meeting: { title: 'Årsmöte' },
				participation: { current: 0, expected: 25 },
				presentationQrEnabled: false,
				revision: 2
			}
		}
	});

	await expect
		.element(screen.getByRole('heading', { name: 'Ingen omröstning är aktiv' }))
		.toBeVisible();
	await expect.element(screen.getByText('Årsmöte')).toBeVisible();
	await expect
		.element(screen.getByRole('button', { name: 'Kontrollera uppdateringar' }))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Ballot');
});

it('shows the participant QR code when the Organizer enables it', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'waiting',
				meeting: { title: 'Årsmöte' },
				participation: { current: 0, expected: 25 },
				presentationQrEnabled: true,
				revision: 2
			}
		}
	});

	await expect
		.element(screen.getByRole('complementary', { name: 'Deltagarlänk med QR-kod' }))
		.toBeVisible();
	await expect
		.element(screen.getByRole('img', { name: 'QR-kod till deltagarlänken' }))
		.toBeVisible();
	await expect.element(screen.getByText('Öppna Årsmöte')).toBeVisible();
	await expect.element(screen.getByText('Skanna för att delta')).not.toBeInTheDocument();
	await expect.element(screen.getByText('Öppna deltagarlänk')).not.toBeInTheDocument();
});

it('shows an active Decision Vote and public progress without ballot controls', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'active',
				meeting: { title: 'Årsmöte' },
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: {
						supportLabel: 'För',
						opposeLabel: 'Emot',
						abstentionLabel: 'Avstår',
						majorityLabel: 'Enkel majoritet'
					}
				},
				participation: { current: 8, expected: 25 },
				presentationQrEnabled: false,
				revision: 3
			}
		}
	});

	await expect.element(screen.getByRole('heading', { name: 'Godkänn budgeten' })).toBeVisible();
	await expect.element(screen.getByText('Enkel majoritet')).toBeVisible();
	await expect.element(screen.getByText('8 av 25 deltagare har röstat')).toBeVisible();
	await expect.element(screen.getByRole('list', { name: 'Svarsalternativ' })).toBeVisible();
	await expect
		.element(screen.getByRole('button', { name: 'Kontrollera uppdateringar' }))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Uppdatera min röst');
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('activeVoteKey');
});

it('shows Selection options without exposing option identifiers', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'active',
				meeting: { title: 'Valmöte' },
				vote: {
					kind: 'selection',
					title: 'Välj ordförande',
					selection: {
						mode: 'single',
						positionCount: 1,
						vacancyEnabled: true,
						options: [{ label: 'Ada' }, { label: 'Bo' }]
					}
				},
				participation: { current: 2, expected: null },
				presentationQrEnabled: false,
				revision: 4
			}
		}
	});

	await expect.element(screen.getByText('Välj ordförande')).toBeVisible();
	await expect.element(screen.getByText('Ada')).toBeVisible();
	await expect.element(screen.getByText('Bo')).toBeVisible();
	await expect.element(screen.getByText('Vakans')).toBeVisible();
	await expect.element(screen.getByText('2 deltagare har röstat')).toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('selectedOptionIds');
});

it('shows a closed Vote without result totals before reveal', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'closed',
				meeting: { title: 'Årsmöte' },
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: { supportLabel: 'För', opposeLabel: 'Emot', abstentionLabel: 'Avstår' }
				},
				participation: { current: 8, expected: 12 },
				presentationQrEnabled: false,
				result: { revealed: false },
				revision: 5
			}
		}
	});

	await expect.element(screen.getByRole('heading', { name: 'Godkänn budgeten' })).toBeVisible();
	await expect
		.element(screen.getByText('Organisatören har inte visat slutresultatet än.'))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Slutresultat');
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Röstfördelning');
});

it('shows a revealed Qualified-majority rejection and its optional breakdown', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'closed',
				meeting: { title: 'Årsmöte' },
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: { supportLabel: 'För', opposeLabel: 'Emot', abstentionLabel: 'Avstår' }
				},
				participation: { current: 4, expected: 12 },
				presentationQrEnabled: false,
				result: {
					revealed: true,
					final: {
						kind: 'decision',
						state: 'rejected',
						winner: null,
						majorityLabel: 'Kvalificerad majoritet, avståenden räknades',
						abstentionsCounted: true
					},
					breakdown: { support: 1, oppose: 2, abstention: 1 }
				},
				revision: 6
			}
		}
	});

	await expect.element(screen.getByText('Förslaget gick inte igenom')).toBeVisible();
	await expect
		.element(screen.getByText('Kvalificerad majoritet, avståenden räknades'))
		.toBeVisible();
	await expect.element(screen.getByRole('list', { name: 'Röstfördelning' })).toBeVisible();
	await expect.element(screen.getByRole('main')).toHaveTextContent('1');
	await expect.element(screen.getByRole('main')).toHaveTextContent('2');
});

it('uses the public wording for tied and no-result Decisions', async () => {
	for (const result of [
		{
			state: 'tie' as const,
			label: 'Oavgjort',
			majorityLabel: 'Enkel majoritet'
		},
		{
			state: 'no-result' as const,
			label: 'Inget resultat',
			majorityLabel: 'Kvalificerad majoritet'
		}
	]) {
		const screen = await render(Page, {
			data: {
				publicLocator: 'ar4m7x2q',
				projection: {
					state: 'closed',
					meeting: { title: 'Årsmöte' },
					vote: {
						kind: 'decision',
						title: 'Godkänn budgeten',
						decision: { supportLabel: 'För', opposeLabel: 'Emot', abstentionLabel: 'Avstår' }
					},
					participation: { current: 2, expected: null },
					presentationQrEnabled: false,
					result: {
						revealed: true,
						final: {
							kind: 'decision',
							state: result.state,
							winner: null,
							majorityLabel: result.majorityLabel,
							abstentionsCounted: false
						}
					},
					revision: 7
				}
			}
		});

		await expect.element(screen.getByText(result.label)).toBeVisible();
		await expect.element(screen.getByText(result.majorityLabel)).toBeVisible();
	}
});

it('shows an ended Meeting without participant controls', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'ended',
				meeting: { title: 'Avslutat årsmöte' },
				participation: { current: 4, expected: 25 },
				presentationQrEnabled: false,
				revision: 8
			}
		}
	});

	await expect.element(screen.getByRole('heading', { name: 'Mötet är avslutat' })).toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Omröstning');
	await expect
		.element(screen.getByRole('complementary', { name: 'Deltagarlänk med QR-kod' }))
		.not.toBeInTheDocument();
});

it('shows an invalid Meeting link without private details', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: { state: 'invalid', message: 'Möteslänken kunde inte hittas.' }
		}
	});

	await expect
		.element(screen.getByRole('heading', { name: 'Länken kunde inte hittas' }))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Avslutat årsmöte');
});
