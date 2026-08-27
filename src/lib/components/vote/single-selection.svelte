<script lang="ts">
	import RadioSelector from '#lib/components/vote/radio-selector.svelte';
	import type { SelectionProps } from '#lib/components/vote/types.js';
	import * as Field from '#lib/components/ui/field/index.js';

	let { selected, selection, vacancyCount, abstain, onSelect }: SelectionProps = $props();

	type Option = { value: string | 'vacant' | 'abstain'; label: string };

	const currentValue = $derived.by(() => {
		if (vacancyCount > 0) {
			return 'vacant';
		}
		if (abstain) {
			return 'abstain';
		}

		return [...selected.values()][0];
	});

	const options = $derived<Option[]>([
		...selection.options.map((option) => ({ value: option.id, label: option.label })),
		...(selection.vacancyEnabled ? [{ value: 'vacant', label: 'Vakant' }] : []),
		{ value: 'abstain', label: 'Avstå' }
	]);
</script>

<Field.FieldSet>
	<Field.Legend variant="label">Välj ett alternativ.</Field.Legend>
	<RadioSelector
		selected={currentValue}
		{options}
		onSelect={(value) => {
			if (value === 'vacant') {
				onSelect({ type: 'vacant', count: 1 });
			} else if (value === 'abstain') {
				onSelect({ type: 'abstain', abstain: true });
			} else {
				onSelect({ type: 'set', optionId: value });
			}
		}}
	/>
</Field.FieldSet>
