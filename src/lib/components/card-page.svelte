<script lang="ts">
	import { cn, type WithoutChildren } from '#lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		children,
		...restProps
	}: WithoutChildren<HTMLAttributes<HTMLElement>> & { children: Snippet } = $props();
</script>

<main
	class="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
>
	<section
		class={cn('w-full max-w-md rounded-lg border border-border bg-card p-6 sm:p-8', className)}
		{...restProps}
	>
		{@render children()}
	</section>
</main>
