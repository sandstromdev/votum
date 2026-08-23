<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import CreateMeetingDialog from '#lib/components/meeting/create-meeting-dialog.svelte';
	import { getOrganizerMeetings } from '#lib/remotes/meeting.remote.js';
	import type { MeetingLifecycle } from '#lib/vote/meeting.js';

	const meetings = $derived(await getOrganizerMeetings());

	function lifecycleLabel(lifecycle: MeetingLifecycle) {
		return lifecycle === 'draft' ? 'Inte öppnat' : lifecycle === 'open' ? 'Öppet' : 'Avslutat';
	}
</script>

<svelte:head>
	<title>Dina möten | votum</title>
</svelte:head>

<div class="space-y-8">
	<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
		<div class="space-y-2">
			<p class="text-sm font-medium tracking-wide text-primary uppercase">Organisatör</p>
			<h1 class="text-3xl font-semibold tracking-tight">Dina möten</h1>
			<p class="text-sm text-muted-foreground">Här hittar du dina möten och deras omröstningar.</p>
		</div>
		<CreateMeetingDialog />
	</div>

	{#if meetings.length === 0}
		<section class="rounded-lg border border-dashed border-border p-8 text-center">
			<h2 class="text-lg font-semibold">Inga möten ännu</h2>
			<p class="mt-2 text-sm text-muted-foreground">Skapa ditt första möte.</p>
		</section>
	{:else}
		<section class="space-y-4">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-xl font-semibold">Möteslista</h2>
				<p class="text-sm text-muted-foreground">
					{meetings.length}
					{meetings.length === 1 ? 'möte' : 'möten'}
				</p>
			</div>

			<div class="grid gap-3 lg:grid-cols-2">
				{#each meetings as meeting (meeting.id)}
					<article class="rounded-lg border border-border bg-card p-5">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
									{lifecycleLabel(meeting.lifecycle)}
								</p>
								<a
									class="mt-1 block truncate text-lg font-semibold underline-offset-4 hover:underline"
									href={`/organisera/${meeting.publicLocator}`}
								>
									{meeting.title}
								</a>
							</div>
							{#if meeting.lifecycle === 'draft'}
								<span class="text-right text-xs text-muted-foreground"
									>Länken aktiveras när mötet öppnas.</span
								>
							{:else}
								<a
									class="text-right text-sm font-medium text-primary underline-offset-4 hover:underline"
									href={meeting.participantPath}
								>
									Öppna deltagarlänk
								</a>
								<a
									class="text-right text-sm font-medium text-primary underline-offset-4 hover:underline"
									href={meeting.presentationPath}
								>
									Öppna presentationsvy
								</a>
							{/if}
						</div>

						<div class="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
							<p class="text-sm text-muted-foreground">
								{meeting.agenda.length === 0
									? 'Ingen agenda än'
									: `${meeting.agenda.length} ${meeting.agenda.length === 1 ? 'punkt' : 'punkter'} i agendan`}
							</p>
							<Button href={`/organisera/${meeting.publicLocator}`} size="sm">Gå till möte</Button>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</div>
