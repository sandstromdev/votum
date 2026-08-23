<script lang="ts">
	import ButtonGroup from '#lib/components/ui/button-group/button-group.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { IconMinus, IconPlus } from '@tabler/icons-svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		value = $bindable(undefined),
		disabled = false,
		id,
		min,
		max,
		class: className,
		onValueChange,
		...rest
	}: Omit<HTMLAttributes<HTMLInputElement>, 'value'> & {
		value: number | undefined;
		disabled?: boolean;
		min?: number;
		max?: number;
		onValueChange?: (value: number | undefined) => void;
	} = $props();

	const atMin = $derived(min != null && (value ?? min) <= min);
	const atMax = $derived(max != null && (value ?? max) >= max);

	function update(val: number | undefined) {
		if (val == null) {
			value = undefined;
		} else {
			value = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, val));
		}

		onValueChange?.(value);
	}

	function increment() {
		update((value ?? min ?? 0) + 1);
	}

	function decrement() {
		update((value ?? max ?? 1) - 1);
	}
</script>

<ButtonGroup class={className}>
	<Button
		type="button"
		variant="outline"
		size="icon"
		onclick={decrement}
		disabled={disabled || atMin}
	>
		<IconMinus />
	</Button>
	<Input
		data-slot="number-field-input"
		class="appearance-none text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
		inputmode="numeric"
		{id}
		{disabled}
		{min}
		{max}
		bind:value
		{...rest}
		onchange={() => update(value)}
	/>
	<Button
		type="button"
		variant="outline"
		size="icon"
		onclick={increment}
		disabled={disabled || atMax}
	>
		<IconPlus />
	</Button>
</ButtonGroup>
