import { render } from 'vitest-browser-svelte';
import { expect, it, vi } from 'vitest';
import { SvelteSet } from 'svelte/reactivity';
import MultiSelection from './multi-selection.svelte';

it('explains that Vacancy is a number of positions left vacant', async () => {
	const screen = await render(MultiSelection, {
		selected: new SvelteSet<string>(),
		selection: {
			mode: 'multiple',
			positionCount: 2,
			vacancyEnabled: true,
			options: [
				{ id: '0193e0a0-0000-7000-8000-000000000010', label: 'Ada' },
				{ id: '0193e0a0-0000-7000-8000-000000000011', label: 'Bo' }
			]
		},
		vacancyCount: 0,
		abstain: false,
		onSelect: vi.fn()
	});

	await expect
		.element(screen.getByText('Ange hur många platser du vill lämna vakanta'))
		.toBeVisible();
});
