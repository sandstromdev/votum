<script lang="ts">
	import Checkbox from '#lib/components/ui/checkbox/checkbox.svelte';
	import { Field, FieldDescription, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { NativeSelect, NativeSelectOption } from '#lib/components/ui/native-select/index.js';
	import type { DraftVoteInput } from '#lib/schemas/vote.js';
	import { DEFAULT_MAJORITY_RULE, majorityRequirement } from '#lib/vote/majority.js';
	import type { RemoteFormFields } from '$app/server';

	let { fields }: { fields: RemoteFormFields<DraftVoteInput> } = $props();

	const uid = $props.id();
	const majorityRule = $derived(fields.majorityRule.value() ?? DEFAULT_MAJORITY_RULE);
	const abstentionsCounted = $derived(fields.abstentionsCounted.value() ?? false);
	const majorityDescription = $derived(majorityRequirement({ majorityRule, abstentionsCounted }));
</script>

<div class="grid gap-4">
	<div class="grid gap-4 sm:grid-cols-3">
		<Field class="gap-2">
			<FieldLabel for={`support-${uid}`}>För</FieldLabel>
			<Input id={`support-${uid}`} {...fields.supportLabel.as('text')} required />
		</Field>
		<Field class="gap-2">
			<FieldLabel for={`oppose-${uid}`}>Emot</FieldLabel>
			<Input id={`oppose-${uid}`} {...fields.opposeLabel.as('text')} required />
		</Field>
		<Field class="gap-2">
			<FieldLabel for={`abstain-${uid}`}>Avstå</FieldLabel>
			<Input id={`abstain-${uid}`} {...fields.abstentionLabel.as('text')} required />
		</Field>
	</div>
	<Field class="gap-2">
		<FieldLabel for={`majority-rule-${uid}`}>Majoritetsregel</FieldLabel>
		<NativeSelect
			id={`majority-rule-${uid}`}
			{...fields.majorityRule.as('select', majorityRule)}
			onchange={(event) => {
				const value = event.currentTarget.value;
				if (value === 'simple' || value === 'qualified') {
					fields.majorityRule.set(value);
					if (value === 'simple') fields.abstentionsCounted.set(false);
				}
			}}
		>
			<NativeSelectOption value="simple">Fler röstar för än emot</NativeSelectOption>
			<NativeSelectOption value="qualified">Minst två tredjedelar röstar för</NativeSelectOption>
		</NativeSelect>
		<FieldDescription>{majorityDescription}</FieldDescription>
	</Field>
	{#if majorityRule === 'qualified'}
		<Field orientation="horizontal" class="items-start">
			<Checkbox
				id={`count-abstentions-${uid}`}
				{...fields.abstentionsCounted.as('checkbox')}
				onCheckedChange={(checked) => fields.abstentionsCounted.set(checked ?? false)}
			/>
			<div class="grid gap-1">
				<FieldLabel for={`count-abstentions-${uid}`}>Räkna avståenden</FieldLabel>
				<FieldDescription>Då räknas avståenden med bland rösterna.</FieldDescription>
			</div>
		</Field>
	{/if}
</div>
