import Content from './field-content.svelte';
import Description from './field-description.svelte';
import Error from './field-error.svelte';
import Group from './field-group.svelte';
import Label from './field-label.svelte';
import Legend from './field-legend.svelte';
import Separator from './field-separator.svelte';
import Set from './field-set.svelte';
import Title from './field-title.svelte';
import Field from './field.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const fieldVariants = tv({
	base: 'gap-3 data-[invalid=true]:text-destructive group/field flex w-full',
	variants: {
		orientation: {
			vertical: 'cn-field-orientation-vertical flex-col [&>*]:w-full [&>.sr-only]:w-auto',
			horizontal:
				'cn-field-orientation-horizontal flex-row items-center has-[>[data-slot=field-content]]:items-start [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
			responsive:
				'cn-field-orientation-responsive flex-col @md/field-group:flex-row @md/field-group:items-center @md/field-group:has-[>[data-slot=field-content]]:items-start [&>*]:w-full @md/field-group:[&>*]:w-auto [&>.sr-only]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px'
		}
	},
	defaultVariants: {
		orientation: 'vertical'
	}
});

export type FieldOrientation = VariantProps<typeof fieldVariants>['orientation'];

export {
	Field,
	Set,
	Legend,
	Group,
	Content,
	Label,
	Title,
	Description,
	Separator,
	Error,
	Set as FieldSet,
	Legend as FieldLegend,
	Group as FieldGroup,
	Content as FieldContent,
	Label as FieldLabel,
	Title as FieldTitle,
	Description as FieldDescription,
	Separator as FieldSeparator,
	Error as FieldError
};
