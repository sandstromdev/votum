<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import FieldError from '#lib/components/ui/field/field-error.svelte';
	import MultiSelection from '#lib/components/vote/multi-selection.svelte';
	import SingleSelection from '#lib/components/vote/single-selection.svelte';
	import type { UpdateSelection } from '#lib/components/vote/types.js';
	import { submitSelectionBallotForm } from '#lib/remotes/ballot.remote.js';
	import { submitSelectionBallotSchema } from '#lib/schemas/ballot.js';
	import { STALE_ACTIVE_VOTE_MESSAGE } from '#lib/vote/ballot.js';
	import type { ParticipantBallot, ParticipantPageProjection } from '#lib/vote/meeting.js';
	import { refreshAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	type SelectionVote = Extract<
		Extract<ParticipantPageProjection, { state: 'active' }>['vote'],
		{ kind: 'selection' }
	>;

	let {
		publicLocator,
		activeVoteKey,
		currentBallot,
		selection,
		onStaleActiveVote
	}: {
		publicLocator: string;
		activeVoteKey: string;
		currentBallot: Extract<ParticipantBallot, { type: 'selection' }> | null;
		selection: SelectionVote['selection'];
		onStaleActiveVote?: () => void;
	} = $props();

	const uid = $props.id();
	const form = submitSelectionBallotForm.for(uid);

	const submitting = new SvelteSet<string>();
	const selected = new SvelteSet<string>(untrack(() => currentBallot?.selectedOptionIds ?? []));

	let dirty = $state(false);
	let initialSubmissionKey = $state<string | undefined>();

	onMount(() => {
		initialSubmissionKey = crypto.randomUUID();
	});
	let vacancyCount = $state(untrack(() => currentBallot?.vacancyCount ?? 0));
	let abstain = $state(untrack(() => currentBallot?.abstain ?? false));

	const selectionCount = $derived(selected.size + vacancyCount);

	function onSelect(update: UpdateSelection) {
		if (update.type === 'abstain') {
			dirty = true;
			vacancyCount = 0;
			abstain = update.abstain;
			selected.clear();

			if (!update.abstain) {
				dirty = false;
			}

			return;
		}

		if (selection.mode === 'multiple' && abstain) {
			return;
		}

		if (update.type === 'vacant') {
			if (selection.mode === 'single') {
				vacancyCount = 1;
				selected.clear();
				abstain = false;
			} else {
				if (selected.size + update.count > selection.positionCount) {
					return;
				}

				vacancyCount = update.count;
			}

			dirty = selectionCount > 0;

			return;
		}

		if (update.type === 'set') {
			dirty = true;
			selected.clear();
			selected.add(update.optionId);
			abstain = false;
			vacancyCount = 0;

			return;
		}

		if (update.type === 'add') {
			if (selected.size + vacancyCount >= selection.positionCount) {
				return;
			}

			selected.add(update.optionId);
		} else if (update.type === 'remove') {
			selected.delete(update.optionId);
		}

		dirty = selectionCount > 0;
	}
</script>

<form
	class="mt-6 grid gap-2 text-sm"
	{...form.preflight(submitSelectionBallotSchema).enhance(async ({ fields, submit }) => {
		const action = fields.action.value();

		if (!action) {
			throw new Error('Action is required');
		}

		submitting.add(action);

		try {
			await submit();
		} finally {
			submitting.delete(action);
		}

		if (!form.result?.success) {
			if (form.fields.allIssues()?.some((issue) => issue.message === STALE_ACTIVE_VOTE_MESSAGE)) {
				onStaleActiveVote?.();
			}
			return;
		}

		if (action === 'withdraw') {
			selected.clear();
			vacancyCount = 0;
			abstain = false;
		}

		dirty = false;

		await refreshAll().catch(() => {
			/* ignore */
		});
	})}
>
	<input {...form.fields.publicLocator.as('hidden', publicLocator)} />
	<input {...form.fields.activeVoteKey.as('hidden', activeVoteKey)} />
	<input {...form.fields.initialSubmissionKey.as('hidden', initialSubmissionKey ?? '')} />
	<input {...form.fields.vacancyCount.as('hidden', vacancyCount)} />
	<input {...form.fields.abstain.as('hidden', abstain)} />

	{#each selected as value, idx (value)}
		<input {...form.fields.selectedOptionIds[idx].as('hidden', value)} />
	{/each}

	{#if selection.mode === 'single'}
		<SingleSelection {selected} {selection} {vacancyCount} {abstain} {onSelect} />
	{:else}
		<MultiSelection {selected} {selection} {vacancyCount} {abstain} {onSelect} />
	{/if}

	<FieldError errors={form.fields.allIssues()} />

	<div class="mt-4 flex flex-col gap-2">
		{#if currentBallot}
			<Button
				variant="ghost"
				{...form.fields.action.as('submit', 'withdraw')}
				loading={submitting.has('withdraw')}
			>
				Ta tillbaka min röst
			</Button>
		{/if}
		<Button
			{...form.fields.action.as('submit', 'cast')}
			disabled={!dirty}
			loading={submitting.has('cast')}
		>
			{currentBallot ? 'Uppdatera min röst' : 'Lämna min röst'}
		</Button>
	</div>
</form>
