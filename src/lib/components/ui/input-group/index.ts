import Addon from './input-group-addon.svelte';
import Button from './input-group-button.svelte';
import Input from './input-group-input.svelte';
import Text from './input-group-text.svelte';
import Textarea from './input-group-textarea.svelte';
import Root from './input-group.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const inputGroupAddonVariants = tv({
	base: "h-auto gap-2 py-2 text-sm font-medium text-muted-foreground group-data-[disabled=true]/input-group:opacity-50 **:data-[slot=kbd]:rounded-4xl **:data-[slot=kbd]:bg-muted-foreground/10 **:data-[slot=kbd]:px-1.5 [&>svg:not([class*='size-'])]:size-4 flex cursor-text items-center justify-center select-none",
	variants: {
		align: {
			'inline-start': 'pl-3 has-[>button]:-ml-1 has-[>kbd]:ml-[-0.15rem] order-first',
			'inline-end': 'pr-3 has-[>button]:-mr-1 has-[>kbd]:mr-[-0.15rem] order-last',
			'block-start':
				'px-3 pt-3 group-has-[>input]/input-group:pt-3 [.border-b]:pb-3 order-first w-full justify-start',
			'block-end':
				'px-3 pb-3 group-has-[>input]/input-group:pb-3 [.border-t]:pt-3 order-last w-full justify-start'
		}
	},
	defaultVariants: {
		align: 'inline-start'
	}
});

export type InputGroupAddonAlign = VariantProps<typeof inputGroupAddonVariants>['align'];

export const inputGroupButtonVariants = tv({
	base: 'gap-2 rounded-4xl text-sm flex items-center shadow-none',
	variants: {
		size: {
			xs: "h-6 gap-1 px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
			sm: 'cn-input-group-button-size-sm',
			'icon-xs': 'size-6 p-0 has-[>svg]:p-0',
			'icon-sm': 'size-8 p-0 has-[>svg]:p-0'
		}
	},
	defaultVariants: {
		size: 'xs'
	}
});

export type InputGroupButtonSize = VariantProps<typeof inputGroupButtonVariants>['size'];

export {
	Root,
	Addon,
	Button,
	Input,
	Text,
	Textarea,
	Root as InputGroup,
	Addon as InputGroupAddon,
	Button as InputGroupButton,
	Input as InputGroupInput,
	Text as InputGroupText,
	Textarea as InputGroupTextarea
};
