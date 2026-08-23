<script lang="ts">
	import type { PublicVoteResult } from '#lib/vote/outcome.js';

	type RevealedResult = Extract<PublicVoteResult, { revealed: true }>;

	let {
		voteKind,
		decision,
		breakdown
	}: {
		voteKind: 'decision' | 'selection';
		decision?: { supportLabel: string; opposeLabel: string; abstentionLabel: string };
		breakdown: NonNullable<RevealedResult['breakdown']>;
	} = $props();
</script>

<ul class="mt-4 grid gap-2 text-sm sm:grid-cols-3" aria-label="Röstfördelning">
	{#if voteKind === 'decision' && 'support' in breakdown && decision}
		<li class="rounded-md bg-muted p-3">
			<span class="text-muted-foreground">{decision.supportLabel}</span>
			<strong class="mt-1 block text-lg">{breakdown.support}</strong>
		</li>
		<li class="rounded-md bg-muted p-3">
			<span class="text-muted-foreground">{decision.opposeLabel}</span>
			<strong class="mt-1 block text-lg">{breakdown.oppose}</strong>
		</li>
		<li class="rounded-md bg-muted p-3">
			<span class="text-muted-foreground">{decision.abstentionLabel}</span>
			<strong class="mt-1 block text-lg">{breakdown.abstention}</strong>
		</li>
	{:else if 'options' in breakdown}
		{#each breakdown.options as option (option.label)}
			<li class="flex items-center justify-between rounded-md bg-muted p-3 sm:col-span-3">
				<span>{option.label}</span><strong>{option.count}</strong>
			</li>
		{/each}
		<li class="flex items-center justify-between rounded-md bg-muted p-3 sm:col-span-3">
			<span>Vakans</span><strong>{breakdown.vacancy}</strong>
		</li>
		<li class="flex items-center justify-between rounded-md bg-muted p-3 sm:col-span-3">
			<span>Avståenden</span><strong>{breakdown.abstention}</strong>
		</li>
	{/if}
</ul>
