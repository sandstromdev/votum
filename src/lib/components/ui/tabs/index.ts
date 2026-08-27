import Content from './tabs-content.svelte';
import Trigger from './tabs-trigger.svelte';
import Root from './tabs.svelte';
import List from './tabs-list.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const tabsListVariants = tv({
	base: 'rounded-4xl p-[3px] group-data-horizontal/tabs:h-9 group-data-vertical/tabs:rounded-2xl data-[variant=line]:rounded-none group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
	variants: {
		variant: {
			default: 'cn-tabs-list-variant-default bg-muted',
			line: 'cn-tabs-list-variant-line gap-1 bg-transparent'
		}
	},
	defaultVariants: {
		variant: 'default'
	}
});

export type TabsListVariant = VariantProps<typeof tabsListVariants>['variant'];

export {
	Root,
	Content,
	List,
	Trigger,
	Root as Tabs,
	Content as TabsContent,
	List as TabsList,
	Trigger as TabsTrigger
};
