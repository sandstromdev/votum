import Separator from './button-group-separator.svelte';
import Text from './button-group-text.svelte';
import Root from './button-group.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const buttonGroupVariants = tv({
	base: "has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-4xl flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
	variants: {
		orientation: {
			horizontal:
				'[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-4xl! [&>[data-slot]]:rounded-r-none [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0',
			vertical:
				'[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-4xl! flex-col [&>[data-slot]]:rounded-b-none [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0'
		}
	},
	defaultVariants: {
		orientation: 'horizontal'
	}
});

export type ButtonGroupOrientation = VariantProps<typeof buttonGroupVariants>['orientation'];

export {
	Root,
	Text,
	Separator,
	Root as ButtonGroup,
	Text as ButtonGroupText,
	Separator as ButtonGroupSeparator
};
