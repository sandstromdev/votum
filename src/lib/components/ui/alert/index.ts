import Action from './alert-action.svelte';
import Description from './alert-description.svelte';
import Title from './alert-title.svelte';
import Root from './alert.svelte';
import { type VariantProps, tv } from 'tailwind-variants';

export const alertVariants = tv({
	base: "grid gap-0.5 rounded-lg border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 group/alert relative w-full",
	variants: {
		variant: {
			default: 'bg-card text-card-foreground',
			destructive:
				'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current'
		}
	},
	defaultVariants: {
		variant: 'default'
	}
});

export type AlertVariant = VariantProps<typeof alertVariants>['variant'];

export {
	Root,
	Description,
	Title,
	Action,
	Root as Alert,
	Description as AlertDescription,
	Title as AlertTitle,
	Action as AlertAction
};
