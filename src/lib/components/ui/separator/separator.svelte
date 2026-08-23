<script lang="ts">
	import { Separator as SeparatorPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		'data-slot': dataSlot = 'separator',
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	data-slot={dataSlot}
	class={cn(
		'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
		// shadcn/ui uses self-stretch here, but it breaks vertical separators in this layout
		'data-[orientation=vertical]:h-full',
		className
	)}
	{...restProps}
/>
