<script lang="ts">
	import { IconLoader } from '@tabler/icons-svelte';
	import { cn } from '#lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: SVGAttributes<SVGSVGElement> & {
		name?: never;
		color?: string;
		stroke?: string;
	} = $props();
</script>

<IconLoader
	{role}
	aria-label={ariaLabel}
	class={cn('size-4 animate-spin', className)}
	{...restProps}
/>
