import { type VariantProps, tv } from 'tailwind-variants';
import type {
	MouseEventHandler,
	HTMLAnchorAttributes,
	HTMLButtonAttributes
} from 'svelte/elements';
import type { WithElementRef } from '#lib/utils.js';
import Base from './button-base.svelte';
import Root from './button.svelte';

export const buttonVariants = tv({
	base: "rounded-4xl border border-transparent bg-clip-padding text-sm font-medium focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
	variants: {
		variant: {
			default: 'bg-primary text-primary-foreground hover:bg-primary/80',
			outline:
				'border-border bg-input/30 hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',

			secondary:
				'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
			ghost:
				'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
			destructive:
				'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
			link: 'text-primary underline-offset-4 hover:underline'
		},
		destructive: {
			true: 'focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 aria-expanded:bg-destructive/10 aria-expanded:text-destructive',
			false: ''
		},
		size: {
			default:
				'h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
			xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
			sm: 'h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
			lg: 'h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
			icon: 'size-9',
			'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
			'icon-sm': 'size-8',
			'icon-lg': 'size-10'
		}
	},
	compoundVariants: [
		{
			variant: ['ghost', 'outline'],
			destructive: true,
			class: 'hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20'
		},
		{
			variant: 'outline',
			destructive: true,
			class: 'hover:border-destructive/40'
		}
	],
	defaultVariants: {
		variant: 'default',
		size: 'default'
	}
});

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

export type ButtonBaseProps = WithElementRef<HTMLButtonAttributes> &
	WithElementRef<HTMLAnchorAttributes> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		destructive?: boolean;
	};

export type ButtonProps = ButtonBaseProps & {
	loading?: boolean;
	onClickPromise?: (
		e:
			| Parameters<MouseEventHandler<HTMLButtonElement>>[0]
			| Parameters<MouseEventHandler<HTMLAnchorElement>>[0]
	) => Promise<void>;
};

export type Size = 'default' | 'xs' | 'sm' | 'lg';

/** Maps a button size to its icon and text variants. */
export const sizeMap = {
	default: {
		icon: 'icon',
		normal: 'default'
	},
	xs: {
		icon: 'icon-xs',
		normal: 'xs'
	},
	sm: {
		icon: 'icon-sm',
		normal: 'sm'
	},
	lg: {
		icon: 'icon-lg',
		normal: 'lg'
	}
} as const;

export { Base, Root, type ButtonProps as Props, Root as Button, Base as ButtonBase };
