<script lang="ts">
	import { cn } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		year = new Date().getFullYear(),
		class: className,
		...restProps
	}: HTMLAttributes<HTMLParagraphElement> & { year?: number } = $props();
</script>

<p class={cn('text-xs text-muted-foreground', className)} {...restProps}>
	Copyright © {year} lsnd.se
</p>
