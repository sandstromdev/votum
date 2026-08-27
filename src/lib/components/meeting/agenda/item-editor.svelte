<script lang="ts">
	import AgendaDecisionFields from './decision-fields.svelte';
	import AgendaSelectionFields from './selection-fields.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import FieldError from '#lib/components/ui/field/field-error.svelte';
	import { Field, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { saveVote } from '#lib/remotes/agenda.remote.js';
	import { draftVoteSchema } from '#lib/schemas/vote.js';
	import { organizerVoteToDraftFields } from '#lib/vote/configuration.js';
	import type { OrganizerVote } from '#lib/vote/agenda.js';
	import type { OrganizerMeeting } from '#lib/vote/meeting.js';
	import { refreshAll } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { cn } from '#lib/utils.js';

	let {
		meeting,
		voteId,
		vote,
		onCancel,
		onDirtyChange,
		class: className = ''
	}: {
		meeting: Pick<OrganizerMeeting, 'id' | 'lifecycle' | 'agenda'>;
		voteId: string | null;
		vote?: OrganizerVote;
		onCancel: () => void;
		onDirtyChange: (dirty: boolean) => void;
		class?: string;
	} = $props();

	const uid = $props.id();
	const form = saveVote.for(untrack(() => voteId ?? uid));

	const initial = untrack(() => organizerVoteToDraftFields(vote));

	form.fields.title.set(initial.title);
	form.fields.kind.set(initial.kind);
	form.fields.supportLabel.set(initial.supportLabel);
	form.fields.opposeLabel.set(initial.opposeLabel);
	form.fields.abstentionLabel.set(initial.abstentionLabel);
	form.fields.majorityRule.set(initial.majorityRule);
	form.fields.abstentionsCounted.set(initial.abstentionsCounted);
	form.fields.positionCount.set(initial.positionCount);
	form.fields.vacancyEnabled.set(initial.vacancyEnabled);
	form.fields.options.set(initial.options);

	const isEdit = $derived(!!voteId);
	const pending = $derived(form.pending > 0);

	let kind = $state(initial.kind);
	let dirty = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);

	const initialValues = untrack(() => form.fields.value());

	function reportDirty() {
		dirty = JSON.stringify(form.fields.value()) !== JSON.stringify(initialValues);
		onDirtyChange(dirty);
	}

	onMount(async () => {
		await tick();
		formElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		titleInput?.focus();
	});
</script>

<form
	bind:this={formElement}
	class={cn('mt-5 rounded-md border p-4', className)}
	oninput={reportDirty}
	onchange={reportDirty}
	onclick={reportDirty}
	{...form.preflight(draftVoteSchema).enhance(async ({ submit }) => {
		if (await submit()) {
			await refreshAll();
			onCancel();
		}
	})}
>
	<input {...form.fields.meetingId.as('hidden', meeting.id)} />
	{#if isEdit}
		<input {...form.fields.voteId.as('hidden', voteId ?? '')} />
	{/if}

	<h4 class="font-medium">{isEdit ? 'Redigera omröstning' : 'Ny omröstning'}</h4>

	<FieldGroup class="mt-4 gap-4">
		<Field class="gap-2">
			<FieldLabel for={`vote-title-${uid}`}>Rubrik</FieldLabel>
			<Input
				id={`vote-title-${uid}`}
				bind:ref={titleInput}
				placeholder="T.ex. Är mötet skäligen sammankallat?"
				{...form.fields.title.as('text', initial.title)}
				required
			/>
			<FieldError errors={form.fields.title.issues()} />
		</Field>
		<Tabs.Root
			class="gap-4"
			bind:value={kind}
			onValueChange={(value) => {
				if (value === 'decision' || value === 'selection') form.fields.kind.set(value);
			}}
		>
			<Field class="gap-2">
				<FieldLabel id={`vote-kind-label-${uid}`}>Typ</FieldLabel>
				<input {...form.fields.kind.as('hidden', kind)} />
				<Tabs.List aria-labelledby={`vote-kind-label-${uid}`}>
					<Tabs.Trigger value="decision">Beslut</Tabs.Trigger>
					<Tabs.Trigger value="selection">Val</Tabs.Trigger>
				</Tabs.List>
				<FieldError errors={form.fields.kind.issues()} />
			</Field>
			<Tabs.Content value="decision">
				{#if form.fields.kind.value() === 'decision'}
					<AgendaDecisionFields fields={form.fields} />
				{/if}
			</Tabs.Content>
			<Tabs.Content value="selection">
				{#if form.fields.kind.value() === 'selection'}
					<AgendaSelectionFields fields={form.fields} initialOptions={initial.options} />
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</FieldGroup>
	<FieldError errors={form.fields.issues()} rootOnly />

	<div class="mt-4 flex gap-2">
		<Button type="submit" loading={pending} disabled={isEdit && !dirty}>
			{isEdit ? 'Spara ändringar' : 'Lägg till'}
		</Button>
		<Button type="button" variant="ghost" onclick={onCancel} disabled={pending}>Avbryt</Button>
	</div>
</form>
