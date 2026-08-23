<script lang="ts">
	import PublicResultBreakdown from '#lib/components/meeting/public-result-breakdown.svelte';
	import type { ParticipantProjection, PresentationProjection } from '#lib/vote/meeting.js';
	import { outcomeLabel } from '#lib/vote/outcome.js';

	type ClosedProjection =
		| Extract<ParticipantProjection, { state: 'closed' }>
		| Extract<PresentationProjection, { state: 'closed' }>;

	let { projection }: { projection: ClosedProjection } = $props();
</script>

{#if projection.result.revealed}
	<div class="mt-8 border-t border-border pt-5">
		<p class="text-sm font-medium tracking-wide text-primary uppercase">Slutresultat</p>
		<p class="mt-2 text-lg font-semibold">{outcomeLabel(projection.result.final)}</p>
		{#if projection.result.final.kind === 'decision' && projection.result.final.majorityLabel}
			<p class="mt-1 text-sm text-muted-foreground">
				{projection.result.final.majorityLabel}
			</p>
		{/if}
		{#if projection.result.breakdown}
			<PublicResultBreakdown
				voteKind={projection.vote.kind}
				decision={projection.vote.kind === 'decision' ? projection.vote.decision : undefined}
				breakdown={projection.result.breakdown}
			/>
		{/if}
	</div>
{:else}
	<p class="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">
		Organisatören har inte visat slutresultatet än.
	</p>
{/if}
