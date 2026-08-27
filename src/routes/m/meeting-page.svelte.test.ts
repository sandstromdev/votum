import { render } from 'vitest-browser-svelte';
import { expect, it, vi } from 'vitest';

function createField(name: string, initialValue: unknown) {
	let value = initialValue;

	return {
		set(nextValue: unknown) {
			value = nextValue;
		},
		value() {
			return value;
		},
		as(type: string, fallback?: unknown) {
			return {
				name,
				type,
				value: value ?? fallback
			};
		},
		issues() {
			return [];
		}
	};
}
const ballotRemote = vi.hoisted(() => {
	function createForm() {
		const form = {
			fields: {
				publicLocator: createField('publicLocator', ''),
				activeVoteKey: createField('activeVoteKey', ''),
				initialSubmissionKey: createField('initialSubmissionKey', ''),
				vacancyCount: createField('vacancyCount', 0),
				abstain: createField('abstain', false),
				choice: createField('choice', ''),
				action: createField('action', 'cast'),
				selectedOptionIds: Array.from({ length: 8 }, (_, index) =>
					createField(`selectedOptionIds.${index}`, '')
				),
				allIssues() {
					return [];
				}
			},
			pending: 0,
			result: { success: true },
			preflight() {
				return form;
			},
			enhance() {
				return { method: 'POST', action: '/remote=test' };
			}
		};

		return {
			for() {
				return form;
			}
		};
	}

	return {
		submitDecisionBallotForm: createForm(),
		submitSelectionBallotForm: createForm()
	};
});

vi.mock('#lib/remotes/meeting.remote.js', () => ({
	participantMeetingLive: vi.fn()
}));
vi.mock('#lib/remotes/ballot.remote.js', () => ballotRemote);
vi.mock('$app/navigation', () => ({
	refreshAll: vi.fn(async () => undefined),
	afterNavigate: vi.fn(),
	goto: vi.fn()
}));

import Page from './[locator]/+page.svelte';

it('shows the Swedish waiting state without exposing future agenda data', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'waiting',
				meeting: { title: 'Årsmöte' },
				participation: { current: 0, expected: 25 },
				revision: 0
			}
		}
	});

	await expect
		.element(screen.getByRole('heading', { name: 'Ingen omröstning är aktiv' }))
		.toBeVisible();
	await expect.element(screen.getByText('Årsmöte')).toBeVisible();
	await expect
		.element(screen.getByText('Nästa omröstning visas här när den är redo.'))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('deltagare');
	await expect
		.element(screen.getByRole('button', { name: 'Kontrollera uppdateringar' }))
		.toBeVisible();
	expect(document.title).toBe('Årsmöte | Väntar på nästa omröstning');
});

it('shows a closed Meeting as ended and without participant controls', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'ended',
				meeting: { title: 'Avslutat årsmöte' },
				participation: { current: 4, expected: 25 },
				revision: 1
			}
		}
	});

	await expect.element(screen.getByRole('heading', { name: 'Mötet är avslutat' })).toBeVisible();
	await expect.element(screen.getByText('Avslutat årsmöte')).toBeVisible();
	await expect.element(screen.getByText('Det går inte längre att lämna in en röst.')).toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('deltagare');
	await expect
		.element(screen.getByRole('button', { name: 'Kontrollera uppdateringar' }))
		.not.toBeInTheDocument();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Omröstning');
	expect(document.title).toBe('Avslutat årsmöte | Mötet är avslutat');
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
					decision: {
						supportLabel: 'För',
						opposeLabel: 'Emot',
						abstentionLabel: 'Avstå'
					}
				},
				participation: { current: 8, expected: 12 },
				result: { revealed: false },
				revision: 4
			}
		}
	});

	await expect
		.element(screen.getByRole('heading', { name: 'Omröstningen är stängd' }))
		.toBeVisible();
	await expect.element(screen.getByText('Godkänn budgeten')).toBeVisible();
	await expect
		.element(screen.getByText('Organisatören har inte visat slutresultatet än.'))
		.toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Slutresultat');
	await expect
		.element(screen.getByRole('main'))
		.not.toHaveTextContent('Röstfördelningen visas offentligt');
	await expect
		.element(screen.getByRole('list', { name: 'Röstfördelning' }))
		.not.toBeInTheDocument();
	expect(document.title).toBe('Godkänn budgeten | Omröstningen är stängd');
});

it('shows Decision aggregate counts after reveal when the public breakdown is enabled', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'closed',
				meeting: { title: 'Årsmöte' },
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: {
						supportLabel: 'För',
						opposeLabel: 'Emot',
						abstentionLabel: 'Avstå'
					}
				},
				participation: { current: 3, expected: 12 },
				result: {
					revealed: true,
					final: { kind: 'decision', state: 'winner', winner: 'support' },
					breakdown: { support: 2, oppose: 1, abstention: 0 }
				},
				revision: 5
			}
		}
	});

	await expect.element(screen.getByText('Slutresultat')).toBeVisible();
	await expect.element(screen.getByText('Förslaget gick igenom')).toBeVisible();
	const breakdown = screen.getByRole('list', { name: 'Röstfördelning' });

	await expect.element(breakdown).toBeVisible();
	await expect.element(breakdown).toHaveTextContent('För');
	await expect.element(breakdown).toHaveTextContent('2');
	await expect.element(breakdown).toHaveTextContent('Emot');
	await expect.element(breakdown).toHaveTextContent('1');
	await expect.element(breakdown).toHaveTextContent('Avstå');
	await expect.element(breakdown).toHaveTextContent('0');
	await expect
		.element(screen.getByRole('main'))
		.not.toHaveTextContent('Röstfördelningen visas offentligt');
});

it('hides aggregate counts after reveal when the public breakdown is disabled', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'closed',
				meeting: { title: 'Årsmöte' },
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: {
						supportLabel: 'För',
						opposeLabel: 'Emot',
						abstentionLabel: 'Avstå'
					}
				},
				participation: { current: 3, expected: 12 },
				result: {
					revealed: true,
					final: { kind: 'decision', state: 'winner', winner: 'support' }
				},
				revision: 5
			}
		}
	});

	await expect.element(screen.getByText('Slutresultat')).toBeVisible();
	await expect.element(screen.getByText('Förslaget gick igenom')).toBeVisible();
	await expect
		.element(screen.getByRole('list', { name: 'Röstfördelning' }))
		.not.toBeInTheDocument();
	await expect
		.element(screen.getByRole('main'))
		.not.toHaveTextContent('Röstfördelningen visas offentligt');
});

it('shows Selection aggregate counts after reveal when the public breakdown is enabled', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'closed',
				meeting: { title: 'Valmöte' },
				vote: { kind: 'selection', title: 'Välj ordförande' },
				participation: { current: 4, expected: 12 },
				result: {
					revealed: true,
					final: { kind: 'selection', state: 'winner', winner: { type: 'option', label: 'Ada' } },
					breakdown: {
						options: [
							{ label: 'Ada', count: 3 },
							{ label: 'Bo', count: 0 }
						],
						vacancy: 1,
						abstention: 0
					}
				},
				revision: 6
			}
		}
	});

	const breakdown = screen.getByRole('list', { name: 'Röstfördelning' });

	await expect.element(breakdown).toBeVisible();
	await expect.element(breakdown.getByText('Ada', { exact: true })).toBeVisible();
	await expect.element(breakdown).toHaveTextContent('Ada');
	await expect.element(breakdown).toHaveTextContent('3');
	await expect.element(breakdown).toHaveTextContent('Bo');
	await expect.element(breakdown).toHaveTextContent('0');
	await expect.element(breakdown).toHaveTextContent('Vakans');
	await expect.element(breakdown).toHaveTextContent('1');
	await expect.element(breakdown).toHaveTextContent('Avstå');
	await expect.element(breakdown).toHaveTextContent('0');
});

it('shows the active Vote presentation without future agenda details', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'active',
				meeting: { title: 'Årsmöte' },
				activeVoteKey: '2026-08-20T10:00:00.000Z',
				vote: {
					kind: 'decision',
					title: 'Godkänn budgeten',
					decision: {
						supportLabel: 'För',
						opposeLabel: 'Emot',
						abstentionLabel: 'Avstår',
						majorityLabel:
							'Förslaget går igenom om fler röstar för än emot. Avståenden påverkar inte utfallet.'
					}
				},
				participation: { current: 0, expected: 25 },
				revision: 2,
				currentBallot: null
			}
		}
	});

	await screen.getByRole('button', { name: 'Så här tas beslutet' }).click();
	await expect
		.element(
			screen.getByText(
				'Förslaget går igenom om fler röstar för än emot. Avståenden påverkar inte utfallet.'
			)
		)
		.toBeVisible();

	await expect.element(screen.getByText('För', { exact: true })).toBeVisible();
	await expect.element(screen.getByText('Emot', { exact: true })).toBeVisible();
	await expect.element(screen.getByText('Avstår', { exact: true })).toBeVisible();
	await expect
		.element(screen.getByRole('button', { name: 'Ta tillbaka min röst' }))
		.not.toBeInTheDocument();
	await expect.element(screen.getByText('Årsmöte')).toBeVisible();
	expect(document.title).toBe('Godkänn budgeten | Årsmöte');
});

it('restores a Selection Ballot and offers replacement and withdrawal', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'active',
				meeting: { title: 'Årsmöte' },
				activeVoteKey: 'active-selection',
				vote: {
					kind: 'selection',
					title: 'Välj styrelse',
					selection: {
						mode: 'multiple',
						positionCount: 3,
						vacancyEnabled: true,
						options: [
							{ id: '0193e0a0-0000-7000-8000-000000000001', label: 'Ada' },
							{ id: '0193e0a0-0000-7000-8000-000000000002', label: 'Bo' },
							{ id: '0193e0a0-0000-7000-8000-000000000003', label: 'Cia' }
						]
					}
				},
				participation: { current: 1, expected: 25 },
				revision: 3,
				currentBallot: {
					type: 'selection',
					selectedOptionIds: [
						'0193e0a0-0000-7000-8000-000000000001',
						'0193e0a0-0000-7000-8000-000000000002'
					],
					vacancyCount: 1,
					abstain: false
				}
			}
		}
	});

	await expect.element(screen.getByRole('checkbox', { name: 'Ada' })).toBeChecked();
	await expect.element(screen.getByRole('checkbox', { name: 'Bo' })).toBeChecked();
	await expect.element(screen.getByRole('checkbox', { name: 'Cia' })).not.toBeChecked();
	await expect.element(screen.getByText('Vakanta platser')).toBeVisible();
	await expect.element(screen.getByRole('textbox')).toHaveValue('1');
	await expect.element(screen.getByRole('button', { name: 'Uppdatera min röst' })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Ta tillbaka min röst' })).toBeVisible();
});

it('shows a generic invalid-link state without meeting details', async () => {
	const screen = await render(Page, {
		data: {
			publicLocator: 'ar4m7x2q',
			projection: {
				state: 'invalid',
				message: 'Möteslänken kunde inte hittas.'
			}
		}
	});

	await expect
		.element(screen.getByRole('heading', { name: 'Länken kunde inte hittas' }))
		.toBeVisible();
	await expect.element(screen.getByText('Möteslänken kunde inte hittas.')).toBeVisible();
	await expect.element(screen.getByRole('main')).not.toHaveTextContent('Årsmöte');
	expect(document.title).toBe('Ogiltig möteslänk');
});
