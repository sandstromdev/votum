<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		rootOnly = false,
		errors,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
		errors?: { message?: string }[];
		rootOnly?: boolean;
	} = $props();

	function onlyRootIssues(issues: { message?: string; path?: string[] }[] | undefined) {
		if (!issues) return undefined;
		return issues.filter((issue) => issue.path == null || issue.path?.length === 0);
	}

	const errorsToDisplay = $derived(rootOnly ? onlyRootIssues(errors) : errors);

	const hasContent = $derived.by(() => {
		if (children) return true;

		if (!errorsToDisplay || errorsToDisplay.length === 0) return false;

		if (errorsToDisplay.length === 1 && !errorsToDisplay[0]?.message) {
			return false;
		}

		return true;
	});

	const isMultipleErrors = $derived(errorsToDisplay && errorsToDisplay.length > 1);
	const singleErrorMessage = $derived(
		errorsToDisplay && errorsToDisplay.length === 1 && errorsToDisplay[0]?.message
	);
</script>

{#if hasContent}
	<div
		bind:this={ref}
		role="alert"
		data-slot="field-error"
		class={cn('text-sm font-normal text-destructive', className)}
		{...restProps}
	>
		{#if children}
			{@render children()}
		{:else if singleErrorMessage}
			{singleErrorMessage}
		{:else if isMultipleErrors}
			<ul class="ml-4 flex list-disc flex-col gap-1">
				{#each errorsToDisplay ?? [] as error, index (index)}
					{#if error?.message}
						<li>{error.message}</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</div>
{/if}
