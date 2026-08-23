<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		max = 100,
		value,
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
	const isIndeterminate = $derived(value === null);
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="progress"
	class={cn(
		'relative flex h-3 w-full items-center overflow-x-hidden rounded-4xl bg-muted',
		className
	)}
	{value}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class={cn('size-full flex-1 bg-primary transition-all', isIndeterminate && 'animate-pulse')}
		style={isIndeterminate
			? undefined
			: `transform: translateX(-${100 - (100 * (value ?? 0)) / (max ?? 1)}%)`}
	></div>
</ProgressPrimitive.Root>
