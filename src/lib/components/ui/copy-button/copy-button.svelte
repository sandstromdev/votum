<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { ButtonProps } from '#lib/components/ui/button/button.svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { WithChildren, WithoutChildren } from 'bits-ui';

	export type CopyButtonPropsWithoutHTML = WithChildren<
		Pick<ButtonProps, 'size' | 'variant'> & {
			ref?: HTMLButtonElement | null;
			text: string;
			icon?: Snippet<[]>;
			animationDuration?: number;
			onCopy?: (status: 'success' | 'failure' | undefined) => void;
		}
	>;

	export type CopyButtonProps = CopyButtonPropsWithoutHTML &
		WithoutChildren<HTMLAttributes<HTMLButtonElement>>;
</script>

<script lang="ts">
	import Button from '#lib/components/ui/button/button.svelte';
	import { UseClipboard } from '#lib/hooks/use-clipboard.svelte.js';
	import { cn } from '#lib/utils.js';
	import { mergeProps } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { IconCheck, IconCopy, IconX } from '@tabler/icons-svelte';

	let {
		ref = $bindable(null),
		text,
		icon,
		animationDuration = 500,
		variant = 'ghost',
		size = 'icon',
		onCopy,
		class: className,
		tabindex,
		children,
		...rest
	}: CopyButtonProps = $props();

	// Text changes the default from icon-only to normal size.
	// svelte-ignore state_referenced_locally
	if (size === 'icon' && children) {
		size = 'default';
	}

	const clipboard = new UseClipboard();

	const merged = $derived(
		mergeProps(rest, {
			onclick: async () => {
				const status = await clipboard.copy(text);

				onCopy?.(status);
			}
		})
	);
</script>

<Button
	bind:ref
	{variant}
	{size}
	{tabindex}
	class={cn('flex items-center gap-2', className)}
	type="button"
	name="copy"
	{...merged as unknown as ButtonProps}
>
	{#if clipboard.status === 'success'}
		<div in:scale={{ duration: animationDuration, start: 0.85 }}>
			<IconCheck tabindex={-1} />
			<span class="sr-only">Kopierad!</span>
		</div>
	{:else if clipboard.status === 'failure'}
		<div in:scale={{ duration: animationDuration, start: 0.85 }}>
			<IconX tabindex={-1} />
			<span class="sr-only">Kunde inte kopiera</span>
		</div>
	{:else}
		<div in:scale={{ duration: animationDuration, start: 0.85 }}>
			{#if icon}
				{@render icon()}
			{:else}
				<IconCopy tabindex={-1} />
			{/if}
			<span class="sr-only">Kopiera</span>
		</div>
	{/if}
	{@render children?.()}
</Button>
