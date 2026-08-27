import type { Snippet } from 'svelte';
import type { ButtonProps } from '#lib/components/ui/button/index.js';
import type { HTMLAttributes } from 'svelte/elements';
import CopyButton from './copy-button.svelte';
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

export { CopyButton };
