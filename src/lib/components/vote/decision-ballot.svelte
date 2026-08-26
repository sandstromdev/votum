<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import FieldError from '#lib/components/ui/field/field-error.svelte';
	import RadioSelector from '#lib/components/vote/radio-selector.svelte';
	import type { DecisionVote } from '#lib/components/vote/types.js';
	import { submitDecisionBallotForm } from '#lib/remotes/ballot.remote.js';
	import { submitDecisionBallotSchema } from '#lib/schemas/ballot.js';
	import { STALE_ACTIVE_VOTE_MESSAGE } from '#lib/vote/ballot.js';
	import type { ParticipantBallot } from '#lib/vote/meeting.js';
	import { refreshAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		publicLocator,
		activeVoteKey,
		currentBallot,
		decision,
		onStaleActiveVote
	}: {
		publicLocator: string;
		activeVoteKey: string;
		currentBallot: Extract<ParticipantBallot, { type: 'decision' }> | null;
		decision: DecisionVote['decision'];
		onStaleActiveVote?: () => void;
	} = $props();

	const uid = $props.id();
	const form = submitDecisionBallotForm.for(uid);

	const submitting = new SvelteSet<string>();

	let dirty = $state(false);
	let initialSubmissionKey = $state<string | undefined>();

	onMount(() => {
		initialSubmissionKey = crypto.randomUUID();
	});

	let choice = $state<string | undefined>(untrack(() => currentBallot?.choice ?? undefined));

	const options = $derived([
		{ value: 'support', label: decision.supportLabel },
		{ value: 'oppose', label: decision.opposeLabel },
		{ value: 'abstention', label: decision.abstentionLabel }
	] as const);
</script>

<form
	class="mt-6 grid gap-2 text-sm"
	{...form.preflight(submitDecisionBallotSchema).enhance(async ({ fields, submit, element }) => {
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
			choice = undefined;
			element.reset();
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

	<RadioSelector
		selected={choice}
		{options}
		onSelect={(value) => {
			choice = value;
			dirty = true;
		}}
	/>

	<input {...form.fields.choice.as('hidden', choice ?? '')} />

	<FieldError errors={form.fields.allIssues()} />

	{#if currentBallot}
		<Button
			{...form.fields.action.as('submit', 'withdraw')}
			variant="ghost"
			loading={submitting.has('withdraw')}
		>
			Ta tillbaka röst
		</Button>
	{/if}
	<Button
		{...form.fields.action.as('submit', 'cast')}
		disabled={!dirty}
		loading={submitting.has('cast')}
	>
		{currentBallot ? 'Uppdatera röst' : 'Lämna röst'}
	</Button>
</form>
