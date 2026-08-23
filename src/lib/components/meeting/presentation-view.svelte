<script lang="ts">
	import PublicResultBreakdown from '#lib/components/meeting/public-result-breakdown.svelte';
	import PresentationQr from '#lib/components/meeting/presentation-qr.svelte';
	import type { PresentationProjection } from '#lib/vote/meeting.js';
	import { outcomeLabel } from '#lib/vote/outcome.js';

	let {
		projection,
		participantLink
	}: { projection: PresentationProjection; participantLink: string } = $props();

	function participationLabel(current: number, expected: number | null) {
		if (expected) return `${current} av ${expected} deltagare har röstat`;
		return `${current} deltagare har röstat`;
	}

	function positionLabel(positionCount: number) {
		return positionCount === 1 ? 'En plats' : `${positionCount} platser`;
	}
</script>

{#if projection.state === 'invalid'}
	<main
		class="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
	>
		<section class="w-full max-w-3xl text-center" aria-labelledby="presentation-title">
			<p class="text-sm font-medium tracking-wide text-muted-foreground uppercase">Möteslänk</p>
			<h1 id="presentation-title" class="mt-3 text-4xl font-semibold tracking-tight">
				Länken kunde inte hittas
			</h1>
			<p class="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">{projection.message}</p>
		</section>
	</main>
{:else if projection.state === 'waiting'}
	<main
		class="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
	>
		<div
			class="flex w-full max-w-7xl flex-col items-center justify-center gap-12 lg:flex-row lg:items-center"
		>
			<section class="w-full max-w-4xl text-center" aria-labelledby="presentation-title">
				<p class="text-lg font-medium text-primary">{projection.meeting.title}</p>
				<h1 id="presentation-title" class="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">
					Ingen omröstning är aktiv
				</h1>
				<p class="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
					Nästa omröstning visas här när den är redo.
				</p>
			</section>
			{#if projection.presentationQrEnabled}
				<PresentationQr data={participantLink} meetingTitle={projection.meeting.title} />
			{/if}
		</div>
	</main>
{:else if projection.state === 'ended'}
	<main
		class="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
	>
		<section class="w-full max-w-4xl text-center" aria-labelledby="presentation-title">
			<p class="text-lg font-medium text-primary">{projection.meeting.title}</p>
			<h1 id="presentation-title" class="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">
				Mötet är avslutat
			</h1>
			<p class="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
				Det går inte längre att lämna in en röst.
			</p>
		</section>
	</main>
{:else if projection.state === 'closed'}
	<main class="min-h-screen bg-background px-6 py-10 text-foreground sm:px-10 sm:py-14">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col items-center gap-12 lg:flex-row lg:items-start lg:justify-center"
		>
			<section class="w-full max-w-5xl" aria-labelledby="presentation-title">
				<header class="text-center">
					<p class="text-lg font-medium text-primary">{projection.meeting.title}</p>
					<p class="mt-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
						Omröstningen är stängd
					</p>
					<h1
						id="presentation-title"
						class="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl"
					>
						{projection.vote.title}
					</h1>
				</header>

				<div class="mx-auto mt-12 max-w-3xl text-center">
					{#if projection.result.revealed}
						<p class="text-sm font-medium tracking-wide text-primary uppercase">Slutresultat</p>
						<p class="mt-3 text-3xl font-semibold sm:text-4xl">
							{outcomeLabel(projection.result.final)}
						</p>
						{#if projection.result.final.kind === 'decision' && projection.result.final.majorityLabel}
							<p class="mt-4 text-lg text-muted-foreground">
								{projection.result.final.majorityLabel}
							</p>
						{/if}
						{#if projection.result.breakdown}
							<PublicResultBreakdown
								voteKind={projection.vote.kind}
								decision={projection.vote.kind === 'decision'
									? projection.vote.decision
									: undefined}
								breakdown={projection.result.breakdown}
							/>
						{/if}
					{:else}
						<p class="text-xl text-muted-foreground">
							Organisatören har inte visat slutresultatet än.
						</p>
					{/if}
				</div>

				<p class="mt-12 text-center text-lg text-muted-foreground">
					{participationLabel(projection.participation.current, projection.participation.expected)}
				</p>
			</section>
			{#if projection.presentationQrEnabled}
				<PresentationQr data={participantLink} meetingTitle={projection.meeting.title} />
			{/if}
		</div>
	</main>
{:else if projection.state === 'active'}
	<main class="min-h-screen bg-background px-6 py-10 text-foreground sm:px-10 sm:py-14">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col items-center gap-12 lg:flex-row lg:items-start lg:justify-center"
		>
			<section class="w-full max-w-5xl" aria-labelledby="presentation-title">
				<header class="text-center">
					<p class="text-lg font-medium text-primary">{projection.meeting.title}</p>
					<p class="mt-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
						Pågående omröstning
					</p>
					<h1
						id="presentation-title"
						class="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl"
					>
						{projection.vote.title}
					</h1>
				</header>

				<div class="mx-auto mt-12 max-w-4xl">
					{#if projection.vote.kind === 'decision'}
						<p class="text-center text-lg text-muted-foreground">
							{projection.vote.decision.majorityLabel}
						</p>
						<div class="mt-8 grid gap-4 sm:grid-cols-3" role="list" aria-label="Svarsalternativ">
							<div role="listitem" class="rounded-xl border border-border bg-card p-6 text-center">
								<p class="text-xl font-semibold">{projection.vote.decision.supportLabel}</p>
							</div>
							<div role="listitem" class="rounded-xl border border-border bg-card p-6 text-center">
								<p class="text-xl font-semibold">{projection.vote.decision.opposeLabel}</p>
							</div>
							<div role="listitem" class="rounded-xl border border-border bg-card p-6 text-center">
								<p class="text-xl font-semibold">{projection.vote.decision.abstentionLabel}</p>
							</div>
						</div>
					{:else}
						<p class="text-center text-lg text-muted-foreground">
							{positionLabel(projection.vote.selection.positionCount)}
						</p>
						<ul class="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Svarsalternativ">
							{#each projection.vote.selection.options as option (option.label)}
								<li
									class="rounded-xl border border-border bg-card p-6 text-center text-xl font-semibold"
								>
									{option.label}
								</li>
							{/each}
							{#if projection.vote.selection.vacancyEnabled}
								<li
									class="rounded-xl border border-border bg-card p-6 text-center text-xl font-semibold"
								>
									Vakans
								</li>
							{/if}
						</ul>
					{/if}
				</div>

				<p class="mt-12 text-center text-lg text-muted-foreground" aria-label="Deltagande">
					{participationLabel(projection.participation.current, projection.participation.expected)}
				</p>
			</section>
			{#if projection.presentationQrEnabled}
				<PresentationQr data={participantLink} meetingTitle={projection.meeting.title} />
			{/if}
		</div>
	</main>
{/if}
