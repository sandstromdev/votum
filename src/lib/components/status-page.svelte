<script lang="ts">
	import CardPage from '#lib/components/card-page.svelte';
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		class: className,
		children
	}: {
		eyebrow?: string;
		title: string;
		description?: string;
		class?: string;
		children?: Snippet;
	} = $props();

	const titleId = $props.id();
</script>

<CardPage class={className} aria-labelledby={titleId}>
	{#if eyebrow}
		<p class="text-sm font-medium text-muted-foreground">{eyebrow}</p>
	{/if}
	<h1 id={titleId} class={['text-3xl font-semibold tracking-tight', eyebrow && 'mt-2']}>
		{title}
	</h1>
	{#if description}
		<p class="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
	{/if}
	{@render children?.()}
</CardPage>
