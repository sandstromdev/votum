<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import { rerunVote } from '#lib/remotes/meeting.remote.js';
	import type { OrganizerMeeting } from '#lib/vote/meeting.js';
	import { majorityRuleLabel } from '#lib/vote/majority.js';
	import { outcomeLabel, type OutcomeHistoryEntry } from '#lib/vote/outcome.js';
	import { refreshAll } from '$app/navigation';
	import {
		IconAlertCircle,
		IconCircleCheck,
		IconCircleX,
		IconEqual,
		IconEye,
		IconEyeOff,
		IconRefresh
	} from '@tabler/icons-svelte';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		meeting
	}: {
		meeting: Pick<OrganizerMeeting, 'id' | 'lifecycle' | 'revision' | 'agenda' | 'outcomeHistory'>;
	} = $props();

	let busy = $state(false);
	const loading = new SvelteSet<string>();

	const invalidatedWithoutOutcome = $derived(
		meeting.agenda.filter(
			(agendaVote) => agendaVote.lifecycle === 'invalidated' && !agendaVote.outcome
		)
	);
	const activeVote = $derived(meeting.agenda.find((agendaVote) => agendaVote.lifecycle === 'open'));
	const canRerun = $derived(meeting.lifecycle === 'open' && !activeVote);

	async function rerun(voteId: string) {
		if (busy || !canRerun) return;
		busy = true;
		loading.add(voteId);
		try {
			await rerunVote({ meetingId: meeting.id, voteId, expectedRevision: meeting.revision });
			await refreshAll();
		} catch {
			toast.error('En ny omröstning kunde inte skapas. Uppdatera sidan och försök igen.');
		} finally {
			busy = false;
			loading.delete(voteId);
		}
	}

	function relatedVoteTitle(voteId: string) {
		return meeting.agenda.find((vote) => vote.id === voteId)?.title ?? 'tidigare omröstning';
	}

	function closedAtLabel(closedAt: string) {
		return new Intl.DateTimeFormat('sv-SE', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(closedAt));
	}

	function resultCardClass(entry: OutcomeHistoryEntry) {
		if (entry.outcome.state === 'winner') return 'border-primary/25 bg-primary/5';
		if (entry.outcome.state === 'rejected') return 'border-destructive/25 bg-destructive/5';
		return 'border-border bg-muted/40';
	}

	function resultTextClass(entry: OutcomeHistoryEntry) {
		if (entry.outcome.state === 'winner') return 'text-primary';
		if (entry.outcome.state === 'rejected') return 'text-destructive';
		return 'text-foreground';
	}
</script>

{#if meeting.outcomeHistory.length > 0}
	<section class="rounded-lg border border-border bg-card p-6">
		<div>
			<p class=" text-sm font-medium tracking-wide text-primary uppercase">Historik</p>
			<h2 class="mt-1 text-xl font-semibold">Resultathistorik</h2>
			{#if canRerun}
				<p class="mt-2 text-sm text-muted-foreground">
					Gör om skapar en ny omröstning som utkast. Aktivera den när du är redo.
				</p>
			{/if}
		</div>
		<ScrollArea class="mt-5 max-h-[38rem]" aria-label="Resultathistorik" type="auto">
			<div class="space-y-4 pr-2">
				{#each meeting.outcomeHistory as entry (entry.voteId)}
					<article class="rounded-lg border border-border bg-background p-4 text-sm shadow-xs">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="min-w-0">
								<div
									class="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground"
								>
									<span class="rounded-full bg-muted px-2 py-1">
										{entry.kind === 'decision' ? 'Beslut' : 'Val'}
									</span>
									{#if entry.invalidated}
										<span class="rounded-full bg-destructive/10 px-2 py-1 text-destructive">
											Ogiltigförklarad
										</span>
									{/if}
								</div>
								<h3 class="mt-3 text-base leading-snug font-semibold">{entry.title}</h3>
								<p class="mt-1 text-xs text-muted-foreground">
									Stängd {closedAtLabel(entry.closedAt)}
								</p>
							</div>

							<div
								class={`flex items-center gap-2 rounded-md border px-3 py-2 font-medium sm:max-w-[52%] ${resultCardClass(entry)}`}
							>
								{#if entry.outcome.state === 'winner'}
									<IconCircleCheck class="size-5 shrink-0 text-primary" aria-hidden="true" />
								{:else if entry.outcome.state === 'rejected'}
									<IconCircleX class="size-5 shrink-0 text-destructive" aria-hidden="true" />
								{:else if entry.outcome.state === 'tie'}
									<IconEqual class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
								{:else}
									<IconAlertCircle
										class="size-5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								{/if}
								<span class={`min-w-0 break-words ${resultTextClass(entry)}`}>
									{outcomeLabel(entry.outcome)}
								</span>
							</div>
						</div>

						{#if entry.kind === 'decision'}
							<div class="mt-4 grid gap-2 sm:grid-cols-3">
								<div class="rounded-md bg-muted/60 p-3">
									<span class="text-xs text-muted-foreground">För</span>
									<strong class="mt-1 block text-lg leading-none">{entry.counts.support}</strong>
								</div>
								<div class="rounded-md bg-muted/60 p-3">
									<span class="text-xs text-muted-foreground">Emot</span>
									<strong class="mt-1 block text-lg leading-none">{entry.counts.oppose}</strong>
								</div>
								<div class="rounded-md bg-muted/60 p-3">
									<span class="text-xs text-muted-foreground">Avståenden</span>
									<strong class="mt-1 block text-lg leading-none">{entry.counts.abstention}</strong>
								</div>
							</div>
						{:else}
							<div class="mt-4 grid gap-2 sm:grid-cols-2">
								{#each entry.counts.options as option (option.id)}
									<div class="flex items-center justify-between gap-3 rounded-md bg-muted/60 p-3">
										<span class="min-w-0 break-words">{option.label}</span>
										<strong class="text-lg leading-none">{option.count}</strong>
									</div>
								{/each}
								<div class="flex items-center justify-between gap-3 rounded-md bg-muted/60 p-3">
									<span>Vakans</span><strong class="text-lg leading-none"
										>{entry.counts.vacancy}</strong
									>
								</div>
								<div class="flex items-center justify-between gap-3 rounded-md bg-muted/60 p-3">
									<span>Avståenden</span>
									<strong class="text-lg leading-none">{entry.counts.abstention}</strong>
								</div>
							</div>
						{/if}

						<div
							class="mt-4 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3"
						>
							<div>
								<span class="block">Registrerade röster</span>
								<strong class="mt-1 block text-sm font-medium text-foreground"
									>{entry.ballotCount}</strong
								>
							</div>
							<div>
								<span class="block">Förväntat antal</span>
								<strong class="mt-1 block text-sm font-medium text-foreground">
									{entry.expectedParticipantCount ?? 'Ej angivet'}
								</strong>
							</div>
							<div class="flex items-start gap-1.5">
								{#if entry.revealed}
									<IconEye class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
									<span>Resultatet visat för deltagarna</span>
								{:else}
									<IconEyeOff class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
									<span>Resultatet inte visat</span>
								{/if}
							</div>
						</div>

						{#if entry.resolution}
							<p class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
								{entry.resolution.type === 'accept'
									? 'Organisatören godkände det inkompletta resultatet.'
									: 'Organisatören markerade de återstående platserna som vakanta.'}
							</p>
						{/if}

						{#if entry.kind === 'decision' && entry.majorityRule}
							<p class="mt-3 text-xs text-muted-foreground">
								{majorityRuleLabel({
									majorityRule: entry.majorityRule,
									abstentionsCounted: entry.abstentionsCounted ?? false
								})}
							</p>
						{/if}

						{#if entry.rerunOfVoteId}
							<p
								class="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground"
							>
								<IconRefresh class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>Omgjord från "{relatedVoteTitle(entry.rerunOfVoteId)}"</span>
							</p>
						{:else if entry.rerunVoteIds.length > 0}
							<p
								class="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground"
							>
								<IconRefresh class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>Ny omröstning skapad: {relatedVoteTitle(entry.rerunVoteIds[0] ?? '')}</span>
							</p>
						{/if}

						{#if canRerun}
							<div class="mt-4 flex justify-end">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onclick={() => rerun(entry.voteId)}
									loading={loading.has(entry.voteId)}
								>
									<IconRefresh class="size-4" aria-hidden="true" />
									Gör om
								</Button>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		</ScrollArea>
		{#if meeting.lifecycle === 'open' && activeVote}
			<p class="mt-4 text-sm text-muted-foreground">
				Gör om blir tillgängligt när den pågående omröstningen är stängd.
			</p>
		{/if}
	</section>
{/if}

{#if invalidatedWithoutOutcome.length > 0}
	<section class="rounded-lg border border-border bg-card p-6">
		<div>
			<p class="text-sm font-medium tracking-wide text-destructive uppercase">Ogiltigförklarad</p>
			<h2 class="mt-1 text-xl font-semibold">Omröstningen fick inget resultat</h2>
		</div>

		<ScrollArea class="mt-5 max-h-96" aria-label="Ogiltigförklarade omröstningar" type="auto">
			<div class="space-y-3 pr-2">
				{#each invalidatedWithoutOutcome as vote (vote.id)}
					<div
						class="flex flex-col gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-start gap-3">
							<IconCircleX class="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
							<div>
								<span class="text-xs font-medium text-destructive">Ogiltigförklarad</span>
								<h3 class="mt-1 font-semibold">{vote.title}</h3>
								<p class="mt-1 text-sm text-muted-foreground">Inget resultat sparades.</p>
							</div>
						</div>
						{#if canRerun}
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy}
								onclick={() => rerun(vote.id)}
								loading={loading.has(vote.id)}
							>
								<IconRefresh class="size-4" aria-hidden="true" />
								Gör om
							</Button>
						{/if}
					</div>
				{/each}
			</div>
		</ScrollArea>
		{#if meeting.lifecycle === 'open' && activeVote}
			<p class="mt-4 text-sm text-muted-foreground">
				Gör om blir tillgängligt när den pågående omröstningen är stängd.
			</p>
		{/if}
	</section>
{/if}
