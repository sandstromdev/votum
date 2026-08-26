<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { openConfirmDialog } from '#lib/confirm-dialog.svelte.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import {
		activateNextVote,
		activateVote,
		closeVote,
		endMeeting,
		invalidateVote,
		revealVote,
		rerunVote,
		resolveIncompleteVote,
		setPublicResultBreakdown
	} from '#lib/remotes/meeting.remote.js';
	import type { OrganizerVote } from '#lib/vote/agenda.js';
	import { majorityRuleLabel } from '#lib/vote/majority.js';
	import type { OrganizerMeeting } from '#lib/vote/meeting.js';
	import { applyIncompleteResolution, outcomeLabel } from '#lib/vote/outcome.js';
	import { refreshAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		meeting
	}: {
		meeting: Pick<
			OrganizerMeeting,
			'id' | 'lifecycle' | 'revision' | 'agenda' | 'expectedParticipantCount' | 'activeBallotCount'
		>;
	} = $props();

	let busy = $state(false);

	const activeVote = $derived(meeting.agenda.find((agendaVote) => agendaVote.lifecycle === 'open'));
	const draftVotes = $derived(
		meeting.agenda.filter((agendaVote) => agendaVote.lifecycle === 'draft')
	);
	const latestClosedVote = $derived(
		[...meeting.agenda]
			.filter((agendaVote) => agendaVote.lifecycle === 'closed')
			.sort((left, right) => (right.closedAt?.getTime() ?? 0) - (left.closedAt?.getTime() ?? 0))[0]
	);
	const latestOutcome = $derived(latestClosedVote?.outcome);
	const latestOutcomeLabel = $derived.by(() => {
		if (!latestOutcome) return null;
		const outcome = latestOutcome.document.outcome;
		return outcome.kind === 'selection'
			? outcomeLabel({
					kind: 'selection',
					...applyIncompleteResolution(outcome, latestClosedVote?.resolution)
				})
			: outcomeLabel(outcome);
	});
	const hasUnrevealedPreviousResult = $derived(
		Boolean(latestClosedVote?.outcome && !latestClosedVote.revealed)
	);
	const hasUnresolvedIncompleteVote = $derived(
		meeting.agenda.some((candidate) => {
			const outcome = candidate.outcome?.document.outcome;
			return (
				candidate.lifecycle === 'closed' &&
				outcome?.kind === 'selection' &&
				outcome.state === 'incomplete' &&
				!candidate.resolution &&
				!meeting.agenda.some((child) => child.rerunOfVoteId === candidate.id)
			);
		})
	);
	const decisionCounts = $derived(
		latestOutcome && 'support' in latestOutcome.document.counts
			? latestOutcome.document.counts
			: null
	);
	const selectionCounts = $derived(
		latestOutcome && 'options' in latestOutcome.document.counts
			? latestOutcome.document.counts
			: null
	);
	const activeBallotProgress = $derived(
		meeting.expectedParticipantCount === null
			? null
			: Math.min(100, ((meeting.activeBallotCount ?? 0) / meeting.expectedParticipantCount) * 100)
	);

	const loading = new SvelteSet<string>();

	async function run(
		action: () => Promise<unknown>,
		errorMessage: string,
		{ rethrow = false, id }: { rethrow?: boolean; id?: string } = {}
	) {
		if (busy) return;
		busy = true;
		if (id) loading.add(id);
		try {
			await action();
			await refreshAll();
		} catch (error) {
			toast.error(errorMessage);
			if (rethrow) throw error;
		} finally {
			busy = false;
			if (id) loading.delete(id);
		}
	}

	function activate(vote: OrganizerVote) {
		return run(
			() =>
				activateVote({
					meetingId: meeting.id,
					voteId: vote.id,
					expectedRevision: meeting.revision
				}),
			'Omröstningen kunde inte aktiveras. Uppdatera sidan och försök igen.',
			{ id: 'activate-vote' }
		);
	}

	function close() {
		if (!activeVote) return;
		return run(
			() =>
				closeVote({
					meetingId: meeting.id,
					voteId: activeVote.id
				}),
			'Omröstningen kunde inte stängas. Uppdatera sidan och försök igen.',
			{ id: 'close' }
		);
	}

	async function activateNext() {
		await run(
			() =>
				activateNextVote({
					meetingId: meeting.id,
					expectedRevision: meeting.revision
				}),
			'Nästa omröstning kunde inte aktiveras. Uppdatera sidan och försök igen.',
			{ rethrow: true, id: 'activate-next' }
		);
	}

	function requestActivateNext() {
		if (busy) return;
		if (hasUnrevealedPreviousResult) {
			openConfirmDialog({
				title: 'Deltagarna har inte sett resultatet',
				description: 'Föregående omröstning är klar. Vill du aktivera nästa ändå?',
				confirmLabel: 'Aktivera ändå',
				onConfirm: activateNext
			});
			return;
		}
		void activateNext();
	}

	function end() {
		if (busy || hasUnresolvedIncompleteVote) return;
		openConfirmDialog({
			title: 'Avsluta mötet',
			description: 'När mötet avslutas kan deltagarna inte längre rösta.',
			confirmLabel: 'Avsluta',
			onConfirm: () =>
				run(
					() => endMeeting({ meetingId: meeting.id, expectedRevision: meeting.revision }),
					'Mötet kunde inte avslutas. Uppdatera sidan och försök igen.',
					{ rethrow: true, id: 'end-meeting' }
				)
		});
	}

	function resolveIncomplete(resolutionType: 'accept' | 'vacancy') {
		if (!latestClosedVote) return;
		return run(
			() =>
				resolveIncompleteVote({
					meetingId: meeting.id,
					voteId: latestClosedVote.id,
					resolutionType
				}),
			'Det inkompletta resultatet kunde inte ändras. Uppdatera sidan och försök igen.',
			{ id: `resolve-${resolutionType}` }
		);
	}

	function rerunIncomplete() {
		if (!latestClosedVote) return;
		return run(
			() => rerunVote({ meetingId: meeting.id, voteId: latestClosedVote.id }),
			'En ny omröstning kunde inte skapas. Uppdatera sidan och försök igen.',
			{ id: 'rerun-incomplete' }
		);
	}

	function invalidate(vote: OrganizerVote) {
		if (busy) return;
		openConfirmDialog({
			title: 'Ogiltigförklara omröstning',
			description: 'Ange varför omröstningen ska ogiltigförklaras.',
			inputType: 'textarea',
			placeholder: 'Skriv en anledning',
			confirmLabel: 'Ogiltigförklara',
			onConfirm: (reason) =>
				run(
					() =>
						invalidateVote({
							meetingId: meeting.id,
							voteId: vote.id,
							reason,
							expectedRevision: meeting.revision
						}),
					'Omröstningen kunde inte ogiltigförklaras. Uppdatera sidan och försök igen.',
					{ rethrow: true, id: `invalidate-vote-${vote.id}` }
				)
		});
	}
</script>

{#if meeting.lifecycle === 'open'}
	<section class="rounded-lg border border-border bg-card p-6">
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
			<div>
				<p class="text-sm font-medium tracking-wide text-primary uppercase">Nästa steg</p>
				<h2 class="mt-1 text-xl font-semibold">
					{activeVote ? 'Pågående omröstning' : 'Ingen omröstning är aktiv'}
				</h2>
			</div>
			<div class="flex gap-2">
				{#if !activeVote}
					<Button
						type="button"
						disabled={draftVotes.length === 0 || busy}
						loading={loading.has('activate-next')}
						onclick={requestActivateNext}
					>
						Aktivera nästa
					</Button>
				{:else}
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={close}
						loading={loading.has('close')}
					>
						Stäng omröstning
					</Button>
					<Button
						type="button"
						variant="ghost"
						destructive
						disabled={busy}
						loading={loading.has('invalidate-vote')}
						onclick={() => invalidate(activeVote)}>Ogiltigförklara</Button
					>
				{/if}
			</div>
		</div>
		<div>
			<p class="mt-2 text-sm text-muted-foreground">
				{activeVote
					? `Deltagarna ser "${activeVote.title}".`
					: 'Aktivera nästa omröstning när du är redo.'}
			</p>
			{#if activeVote}
				<div class="mt-4 space-y-2">
					<p class="text-sm font-medium text-muted-foreground">
						{#if meeting.expectedParticipantCount !== null}
							{meeting.activeBallotCount ?? 0} av {meeting.expectedParticipantCount} deltagare har röstat.
						{:else}
							{meeting.activeBallotCount ?? 0} deltagare har röstat.
						{/if}
					</p>
					<Progress value={activeBallotProgress} aria-label="Andel deltagare som har röstat" />
				</div>
			{/if}
		</div>

		{#if !activeVote && draftVotes.length > 0}
			<div class="mt-5 border-t border-border pt-5">
				<p class="text-sm font-medium">Välj en fråga att aktivera</p>
				<div class="mt-3 grid gap-2">
					{#each draftVotes as vote (vote.id)}
						<Button
							type="button"
							variant="outline"
							class="justify-start"
							disabled={busy}
							loading={loading.has('activate-vote')}
							onclick={() => activate(vote)}>{vote.title}</Button
						>
					{/each}
				</div>
			</div>
		{:else if !activeVote}
			<p class="mt-5 border-t border-border pt-5 text-sm text-muted-foreground">
				Agendan är tom. Lägg till en omröstning för att fortsätta.
			</p>
		{/if}

		{#if !activeVote}
			<div class="mt-5 flex justify-end border-t border-border pt-5">
				<Button
					type="button"
					variant="ghost"
					disabled={busy || hasUnresolvedIncompleteVote}
					loading={loading.has('end-meeting')}
					onclick={end}
				>
					Avsluta möte
				</Button>
			</div>
			{#if hasUnresolvedIncompleteVote}
				<p class="mt-3 text-right text-sm text-muted-foreground">
					Lös det inkompletta resultatet innan mötet avslutas.
				</p>
			{/if}
		{/if}
	</section>
{:else if meeting.lifecycle === 'closed'}
	<section class="rounded-lg border border-border bg-card p-6">
		<p class="text-sm font-medium tracking-wide text-muted-foreground uppercase">Nästa steg</p>
		<h2 class="mt-1 text-xl font-semibold">Mötet är avslutat</h2>
	</section>
{/if}

{#if latestClosedVote?.outcome}
	<section class="rounded-lg border border-border bg-card p-6">
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
			<div>
				<p class="text-sm font-medium tracking-wide text-primary uppercase">Senaste resultatet</p>
				<h2 class="mt-1 text-xl font-semibold">{latestClosedVote.title}</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					{latestClosedVote.outcome.document.ballotCount} röster registrerades när omröstningen stängdes.
				</p>
			</div>
			<div class="flex flex-wrap justify-end gap-2">
				{#if meeting.lifecycle === 'open' && !latestClosedVote.revealed}
					<Button
						type="button"
						variant="ghost"
						destructive
						disabled={busy}
						loading={loading.has(`invalidate-vote-${latestClosedVote.id}`)}
						onclick={() => invalidate(latestClosedVote)}
					>
						Ogiltigförklara
					</Button>
				{/if}
				{#if !latestClosedVote.revealed && latestClosedVote.outcome.document.outcome.kind === 'selection' && latestClosedVote.outcome.document.outcome.state === 'incomplete'}
					<Button
						type="button"
						variant={latestClosedVote.resolution?.type === 'accept' ? 'default' : 'outline'}
						disabled={busy}
						loading={loading.has('accept-incomplete')}
						onclick={() => resolveIncomplete('accept')}
					>
						Godkänn inkomplett resultat
					</Button>
					<Button
						type="button"
						variant={latestClosedVote.resolution?.type === 'vacancy' ? 'default' : 'outline'}
						disabled={busy}
						loading={loading.has('resolve-vacancy')}
						onclick={() => resolveIncomplete('vacancy')}
					>
						Markera återstående platser som vakanta
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={rerunIncomplete}
						loading={loading.has('rerun-incomplete')}
					>
						Gör om omröstningen
					</Button>
				{:else if !latestClosedVote.revealed}
					<Button
						type="button"
						disabled={busy}
						loading={loading.has('reveal-vote')}
						onclick={() =>
							run(
								() => revealVote({ meetingId: meeting.id, voteId: latestClosedVote.id }),
								'Resultatet kunde inte visas. Uppdatera sidan och försök igen.',
								{ id: 'reveal-vote' }
							)}
					>
						Visa slutresultat
					</Button>
				{:else if meeting.lifecycle === 'open' && !activeVote}
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						loading={loading.has(`update-public-result`)}
						onclick={() =>
							run(
								() =>
									setPublicResultBreakdown({
										meetingId: meeting.id,
										voteId: latestClosedVote.id,
										enabled: !latestClosedVote.publicResultBreakdownEnabled
									}),
								'Resultatöversikten kunde inte ändras. Uppdatera sidan och försök igen.',
								{ id: `update-public-result` }
							)}
					>
						{latestClosedVote.publicResultBreakdownEnabled
							? 'Dölj röstfördelningen för deltagarna'
							: 'Visa röstfördelningen för deltagarna'}
					</Button>
				{/if}
			</div>
		</div>

		{#if latestClosedVote.outcome.document.vote.kind === 'decision'}
			<p class="mt-5 text-sm text-muted-foreground">
				{majorityRuleLabel(latestClosedVote.outcome.document.vote.decision)}.
			</p>
			<p class="mt-5 text-lg font-semibold">{latestOutcomeLabel}</p>
			<div class="mt-5 grid gap-2 text-sm sm:grid-cols-3">
				<div class="rounded-md bg-muted p-3">
					<span class="text-muted-foreground"
						>{latestClosedVote.outcome.document.vote.decision.supportLabel}</span
					>
					<strong class="mt-1 block text-lg">{decisionCounts?.support ?? 0}</strong>
				</div>
				<div class="rounded-md bg-muted p-3">
					<span class="text-muted-foreground"
						>{latestClosedVote.outcome.document.vote.decision.opposeLabel}</span
					>
					<strong class="mt-1 block text-lg">{decisionCounts?.oppose ?? 0}</strong>
				</div>
				<div class="rounded-md bg-muted p-3">
					<span class="text-muted-foreground"
						>{latestClosedVote.outcome.document.vote.decision.abstentionLabel}</span
					>
					<strong class="mt-1 block text-lg">{decisionCounts?.abstention ?? 0}</strong>
				</div>
			</div>
		{:else}
			<div class="mt-4 rounded-lg border p-3">
				<p class="text-sm text-muted-foreground">Resultat</p>
				<p class="text-lg font-semibold">{latestOutcomeLabel}</p>
			</div>
			<div class="mt-5 grid gap-2 text-sm sm:grid-cols-2">
				{#each selectionCounts?.options ?? [] as option (option.id)}
					<div class="flex items-center justify-between rounded-md bg-muted p-3">
						<span>{option.label}</span><strong>{option.count}</strong>
					</div>
				{/each}
				<div class="flex items-center justify-between rounded-md bg-muted p-3">
					<span>Vakans</span><strong>{selectionCounts?.vacancy ?? 0}</strong>
				</div>
				<div class="flex items-center justify-between rounded-md bg-muted p-3">
					<span>Avståenden</span><strong>{selectionCounts?.abstention ?? 0}</strong>
				</div>
			</div>
		{/if}
	</section>
{/if}
