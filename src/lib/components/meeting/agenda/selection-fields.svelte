<script lang="ts">
	import AgendaOptionsField from './options-field.svelte';
	import Checkbox from '#lib/components/ui/checkbox/checkbox.svelte';
	import { Field, FieldLabel } from '#lib/components/ui/field/index.js';
	import { NumberField } from '#lib/components/ui/number-field/index.js';
	import type { DraftVoteInput } from '#lib/schemas/vote.js';
	import { DEFAULT_VACANCY_ENABLED } from '#lib/vote/agenda.js';
	import type { RemoteFormFields } from '$app/server';

	let {
		fields,
		initialOptions = []
	}: { fields: RemoteFormFields<DraftVoteInput>; initialOptions?: string[] } = $props();

	const uid = $props.id();
	const vacancyEnabled = $derived(fields.vacancyEnabled.value() ?? DEFAULT_VACANCY_ENABLED);

	let positionCount = $state(1);
</script>

<div class="flex flex-col gap-4">
	<div class="grid gap-4 sm:grid-cols-2">
		<Field class="gap-2">
			<FieldLabel for={`position-count-${uid}`}>Antal platser</FieldLabel>
			{#if positionCount}
				<input {...fields.positionCount.as('hidden', positionCount)} />
			{/if}
			<NumberField id={`position-count-${uid}`} class="!w-40" min={1} bind:value={positionCount} />
		</Field>
		<Field orientation="horizontal" class="self-end pb-2">
			<Checkbox
				id={`vacancy-${uid}`}
				{...fields.vacancyEnabled.as('checkbox')}
				onCheckedChange={(checked) => fields.vacancyEnabled.set(checked ?? false)}
			/>
			<FieldLabel for={`vacancy-${uid}`}>Tillåt vakans</FieldLabel>
		</Field>
	</div>
	<AgendaOptionsField
		idPrefix={`options-${uid}`}
		field={fields.options}
		initialValues={initialOptions}
		{vacancyEnabled}
	/>
</div>
