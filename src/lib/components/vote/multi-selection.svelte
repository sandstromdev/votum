<script lang="ts">
	import { buttonVariants } from '#lib/components/ui/button/button-base.svelte';
	import Checkbox from '#lib/components/ui/checkbox/checkbox.svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import NumberField from '#lib/components/ui/number-field/number-field.svelte';
	import type { SelectionProps } from '#lib/components/vote/types.js';
	import { cn } from '#lib/utils.js';

	let { selected, selection, vacancyCount, abstain, onSelect }: SelectionProps = $props();

	const maxSelected = $derived(selection.positionCount - (vacancyCount ?? 0));

	function isDisabled(optionId: string) {
		if (abstain) return true;

		if (selected.has(optionId)) return false;

		if (selected.size < maxSelected) return false;

		return true;
	}

	function handleChange(optionId: string, checked: boolean) {
		if (checked) {
			onSelect({ type: 'add', optionId });
		} else {
			onSelect({ type: 'remove', optionId });
		}
	}
	function handleVacancyCountChange(value: number | undefined) {
		onSelect({ type: 'vacant', count: value ?? 0 });
	}
	function handleAbstainChange(checked: boolean) {
		onSelect({ type: 'abstain', abstain: checked });
	}
</script>

<Field.Group class="gap-4">
	<Field.FieldSet class="gap-3">
		<Field.Legend variant="label">
			Välj upp till {selection.positionCount} alternativ.
		</Field.Legend>
		{#each selection.options as option (option.id)}
			{@const disabled = isDisabled(option.id)}
			<Field.Label
				aria-disabled={disabled}
				class={cn(
					buttonVariants({ variant: 'outline' }),
					'w-full items-center justify-start gap-3'
				)}
			>
				<Checkbox
					checked={selected.has(option.id)}
					{disabled}
					onCheckedChange={(b) => handleChange(option.id, b)}
				/>
				<span class="leading-none">{option.label}</span>
			</Field.Label>
		{/each}
	</Field.FieldSet>

	{#if selection.vacancyEnabled}
		<Field.Field>
			<Field.Label>Vakanta platser</Field.Label>
			<Field.Description>Ange hur många platser du vill lämna vakanta</Field.Description>
			<NumberField
				value={vacancyCount}
				onValueChange={handleVacancyCountChange}
				disabled={abstain || selected.size === selection.positionCount}
				min={0}
				max={selection.positionCount - selected.size}
			/>
		</Field.Field>
	{/if}

	<Field.Field>
		<Field.Label for="abstain">Avstå från att rösta</Field.Label>
		<Field.Label
			class={cn(buttonVariants({ variant: 'outline' }), 'w-full items-center justify-start gap-3')}
		>
			<Checkbox id="abstain" checked={abstain} onCheckedChange={(c) => handleAbstainChange(c)} />
			<span class="leading-none">Avstå</span>
		</Field.Label>
	</Field.Field>

	<Field.Description>
		{#if abstain}
			Du avstår från att rösta
		{:else}
			Du har valt {selected.size + vacancyCount} av {selection.positionCount} alternativ.
		{/if}
	</Field.Description>
</Field.Group>
