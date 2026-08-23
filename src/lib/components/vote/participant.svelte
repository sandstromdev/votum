<script lang="ts">
	import CardPage from '#lib/components/card-page.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import DecisionBallot from '#lib/components/vote/decision-ballot.svelte';
	import SelectionBallot from '#lib/components/vote/selection-ballot.svelte';
	import type {
		ParticipantDecisionBallot,
		ParticipantSelectionBallot
	} from '#lib/components/vote/types.js';
	import type { ParticipantPageProjection } from '#lib/vote/meeting.js';
	import type { Snippet } from 'svelte';

	let {
		publicLocator,
		meetingTitle,
		projection,
		children
	}: {
		publicLocator: string;
		meetingTitle: string;
		projection: Extract<ParticipantPageProjection, { state: 'active' }>;
		children?: Snippet;
	} = $props();

	const titleId = $props.id();

	let needsRefresh = $state(false);

	const vote = $derived(projection.vote);
	const currentBallot = $derived(projection.currentBallot);

	function reloadPage() {
		location.reload();
	}

	function onStaleActiveVote() {
		needsRefresh = true;
	}
</script>

<CardPage class="max-w-lg" aria-labelledby={titleId}>
	<p class="text-sm font-medium text-muted-foreground">{meetingTitle}</p>
	<h1 id={titleId} class="mt-2 text-3xl font-semibold tracking-tight">{vote.title}</h1>

	{#if vote.kind === 'decision'}
		<DecisionBallot
			{publicLocator}
			activeVoteKey={projection.activeVoteKey}
			currentBallot={currentBallot as ParticipantDecisionBallot | null}
			decision={vote.decision}
			{onStaleActiveVote}
		/>
	{:else}
		<SelectionBallot
			{publicLocator}
			activeVoteKey={projection.activeVoteKey}
			currentBallot={currentBallot as ParticipantSelectionBallot | null}
			selection={vote.selection}
			{onStaleActiveVote}
		/>
	{/if}

	{#if needsRefresh}
		<Button type="button" variant="outline" class="mt-3 w-full" onclick={reloadPage}>
			Uppdatera sidan
		</Button>
	{/if}
	{@render children?.()}
</CardPage>
