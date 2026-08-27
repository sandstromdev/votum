<script lang="ts">
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { cn } from '#lib/utils.js';
	import Base from './button-base.svelte';
	import type { ButtonProps } from './index.js';

	let {
		ref = $bindable(null),
		loading: loadingProp = false,
		onClickPromise,
		onclick,
		disabled,
		class: className,
		children,
		destructive = false,
		...restProps
	}: ButtonProps = $props();

	let pending = $state(false);

	const loading = $derived(loadingProp || pending);
</script>

<Base
	bind:ref
	class={cn(loading && '[&_svg:not([data-loading-icon])]:hidden', className)}
	disabled={loading || disabled}
	{destructive}
	data-loading={loading ? '' : undefined}
	onclick={async (e) => {
		onclick?.(e as never);

		if (onClickPromise) {
			pending = true;
			try {
				await onClickPromise(e);
			} finally {
				pending = false;
			}
		}
	}}
	{...restProps}
>
	{#if loading}
		<Spinner data-icon="inline-start" data-loading-icon />
	{/if}
	{@render children?.()}
</Base>
