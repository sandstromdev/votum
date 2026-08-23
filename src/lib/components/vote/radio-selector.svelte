<script lang="ts" generics="T extends string">
	import { buttonVariants } from '#lib/components/ui/button/button-base.svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import { cn } from '#lib/utils.js';

	let {
		selected,
		options,
		onSelect
	}: {
		selected: T | undefined;
		onSelect: (value: T) => void;
		options: readonly { value: T; label: string }[];
	} = $props();
</script>

<RadioGroup.Root value={selected} onValueChange={(value) => onSelect(value as T)}>
	{#each options as option (option.value)}
		<Field.Label
			for={option.value}
			class={cn(buttonVariants({ variant: 'outline' }), 'w-full items-center justify-start gap-3')}
		>
			<RadioGroup.Item value={option.value} id={option.value} />
			<span class="leading-none">{option.label}</span>
		</Field.Label>
	{/each}
</RadioGroup.Root>
