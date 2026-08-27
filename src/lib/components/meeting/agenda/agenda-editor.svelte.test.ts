import { render } from 'vitest-browser-svelte';
import { beforeEach, expect, vi, it } from 'vitest';
import { settled } from 'svelte';
import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
import { cancelConfirmDialog } from '#lib/confirm-dialog.svelte.js';
import AgendaEditor from './agenda-editor.svelte';
import type { OrganizerVote } from '#lib/vote/agenda.js';

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
			function updateFromEvent(event: Event) {
				const target = event.currentTarget;

				if (target instanceof HTMLInputElement) {
					value = type === 'checkbox' ? target.checked : target.value;
				} else if (target instanceof HTMLSelectElement) {
					value = target.value;
				}
			}

			return {
				name,
				type,
				value: value ?? fallback,
				checked: value === true,
				oninput: updateFromEvent,
				onchange: updateFromEvent
			};
		},
		issues() {
			return [];
		}
	};
}

const remote = vi.hoisted(() => {
	function createForm() {
		const fields = {
			meetingId: createField('meetingId', ''),
			voteId: createField('voteId', ''),
			title: createField('title', ''),
			kind: createField('kind', 'decision'),
			supportLabel: createField('supportLabel', 'För'),
			opposeLabel: createField('opposeLabel', 'Emot'),
			abstentionLabel: createField('abstentionLabel', 'Avstå'),
			majorityRule: createField('majorityRule', 'simple'),
			abstentionsCounted: createField('abstentionsCounted', false),
			positionCount: createField('positionCount', 1),
			vacancyEnabled: createField('vacancyEnabled', true),
			options: createField('options', [])
		};

		const form = {
			fields: {
				...fields,
				value() {
					return Object.fromEntries(
						Object.entries(fields).map(([name, field]) => [name, field.value()])
					);
				},
				issues() {
					return [];
				}
			},
			pending: 0,
			preflight() {
				return form;
			},
			enhance(
				callback: (input: {
					element: HTMLFormElement;
					submit: () => Promise<boolean>;
				}) => Promise<void>
			) {
				return {
					method: 'POST',
					action: '/remote=test',
					onsubmit: async (event: SubmitEvent) => {
						event.preventDefault();
						if (event.currentTarget instanceof HTMLFormElement) {
							await callback({
								element: event.currentTarget,
								submit: async () => true
							});
						}
					}
				};
			}
		};

		return form;
	}

	return {
		saveVote: { for: vi.fn(() => createForm()) },
		deleteVote: vi.fn(async () => undefined),
		reorderVotes: vi.fn(async () => undefined)
	};
});

vi.mock('#lib/remotes/agenda.remote.js', () => remote);
vi.mock('$app/navigation', () => ({ refreshAll: vi.fn(async () => undefined) }));

const meetingId = '0193e0a0-0000-7000-8000-000000000001';
const firstVoteId = '0193e0a0-0000-7000-8000-000000000002';
const secondVoteId = '0193e0a0-0000-7000-8000-000000000003';

function decisionVote(id: string, title: string, position: number): OrganizerVote {
	return {
		id,
		meetingId,
		position,
		title,
		lifecycle: 'draft' as const,
		openedAt: null,
		closedAt: null,
		rerunOfVoteId: null,
		invalidationReason: null,
		invalidatedAt: null,
		kind: 'decision' as const,
		decision: {
			supportLabel: 'För',
			opposeLabel: 'Emot',
			abstentionLabel: 'Avstå',
			majorityRule: 'simple' as const,
			abstentionsCounted: false
		}
	};
}

function createMeeting(agenda: OrganizerVote[] = []) {
	return {
		id: meetingId,
		lifecycle: 'draft' as const,
		agenda
	};
}

beforeEach(() => {
	cancelConfirmDialog();
	remote.deleteVote.mockClear();
});

it('opens a new Vote form and focuses Rubrik', async () => {
	const screen = await render(AgendaEditor, { meeting: createMeeting() });

	await settled();

	await screen.getByRole('button', { name: 'Lägg till omröstning' }).click();
	await settled();

	await expect.element(screen.getByRole('heading', { name: 'Ny omröstning' })).toBeVisible();
	await expect.element(screen.getByRole('textbox', { name: 'Rubrik' })).toHaveFocus();
});

it('replaces a draft Vote with its edit form in the same list', async () => {
	const screen = await render(AgendaEditor, {
		meeting: createMeeting([
			decisionVote(firstVoteId, 'Första beslutet', 0),
			decisionVote(secondVoteId, 'Andra beslutet', 1)
		])
	});

	await screen.getByRole('button', { name: 'Redigera omröstning' }).first().click();

	await expect.element(screen.getByRole('heading', { name: 'Redigera omröstning' })).toBeVisible();
	await expect
		.element(
			screen.getByTestId(`agenda-vote-${firstVoteId}`).getByRole('textbox', { name: 'Rubrik' })
		)
		.toBeVisible();
	await expect.element(screen.getByText('Första beslutet')).not.toBeInTheDocument();
	await expect.element(screen.getByText('Andra beslutet')).toBeVisible();
	await expect.element(screen.getByRole('textbox', { name: 'Rubrik' })).toHaveFocus();
});

it('cancels editing without changing the original Vote card', async () => {
	const screen = await render(AgendaEditor, {
		meeting: createMeeting([decisionVote(firstVoteId, 'Första beslutet', 0)])
	});

	await screen.getByRole('button', { name: 'Redigera omröstning' }).click();
	await screen.getByRole('textbox', { name: 'Rubrik' }).fill('Ändrad rubrik');
	await screen.getByRole('button', { name: 'Avbryt' }).click();

	await expect.element(screen.getByText('Första beslutet')).toBeVisible();
	await expect.element(screen.getByText('Ändrad rubrik')).not.toBeInTheDocument();
});

it('saves an edited Vote and restores its card', async () => {
	const screen = await render(AgendaEditor, {
		meeting: createMeeting([decisionVote(firstVoteId, 'Första beslutet', 0)])
	});

	await screen.getByRole('button', { name: 'Redigera omröstning' }).click();
	const saveButton = screen.getByRole('button', { name: 'Spara ändringar' });

	await expect.element(saveButton).toBeDisabled();
	await screen.getByRole('textbox', { name: 'Rubrik' }).fill('Ändrad rubrik');
	await expect.element(saveButton).not.toBeDisabled();
	await saveButton.click();

	await expect
		.element(screen.getByRole('heading', { name: 'Redigera omröstning' }))
		.not.toBeInTheDocument();
	await expect.element(screen.getByText('Första beslutet')).toBeVisible();
});

it('keeps unsaved form data when starting another Vote form is declined', async () => {
	await render(ConfirmDialog);
	const screen = await render(AgendaEditor, { meeting: createMeeting() });

	await screen.getByRole('button', { name: 'Lägg till omröstning' }).click();
	await screen.getByRole('textbox', { name: 'Rubrik' }).fill('Osparad rubrik');
	await screen.getByRole('button', { name: 'Lägg till omröstning' }).click();
	await screen.getByRole('alertdialog').getByRole('button', { name: 'Avbryt' }).click();

	await expect.element(screen.getByRole('heading', { name: 'Ny omröstning' })).toBeVisible();
	await expect
		.element(screen.getByRole('textbox', { name: 'Rubrik' }))
		.toHaveValue('Osparad rubrik');
});

it('deletes a Vote only after confirmation', async () => {
	await render(ConfirmDialog);
	const screen = await render(AgendaEditor, {
		meeting: createMeeting([decisionVote(firstVoteId, 'Första beslutet', 0)])
	});

	await screen.getByTestId(`agenda-vote-${firstVoteId}`).getByRole('button').last().click();
	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	expect(remote.deleteVote).not.toHaveBeenCalled();

	await screen.getByRole('button', { name: 'Ta bort' }).click();

	expect(remote.deleteVote).toHaveBeenCalledWith({ meetingId, voteId: firstVoteId });
});
