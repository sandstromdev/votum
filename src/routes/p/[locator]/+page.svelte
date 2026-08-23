<script lang="ts">
	import PresentationView from '#lib/components/meeting/presentation-view.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { presentationMeetingLive } from '#lib/remotes/meeting.remote.js';
	import type { PresentationProjection } from '#lib/vote/meeting.js';
	import { ORIGIN } from '$app/env/public';
	import { refreshAll } from '$app/navigation';
	import { onDestroy } from 'svelte';

	let {
		data
	}: {
		data: { publicLocator: string; projection: PresentationProjection };
	} = $props();

	const liveProjection = $derived(
		import.meta.env.MODE === 'test'
			? null
			: presentationMeetingLive({ publicLocator: data.publicLocator })
	);
	const projection = $derived.by(() => {
		const live = liveProjection?.current;
		if (!live) return data.projection;
		if (live.state === 'invalid')
			return data.projection.state === 'invalid' ? live : data.projection;
		if (data.projection.state === 'invalid') return live;
		return live.revision >= data.projection.revision ? live : data.projection;
	});
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let pollDelay = 5_000;
	let checking = $state(false);
	let updateError = $state<string | null>(null);
	const liveUnavailable = $derived(Boolean(liveProjection?.done || liveProjection?.error));

	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = undefined;
	}

	function schedulePolling() {
		if (pollTimer || liveProjection?.connected || !liveUnavailable) return;

		pollTimer = setTimeout(async () => {
			pollTimer = undefined;
			try {
				await refreshAll();
				pollDelay = 5_000;
			} catch {
				pollDelay = Math.min(pollDelay * 2, 30_000);
			}
			schedulePolling();
		}, pollDelay);
	}

	$effect(() => {
		if (liveProjection?.connected) stopPolling();
		else if (liveUnavailable) schedulePolling();
	});

	onDestroy(stopPolling);

	async function checkForUpdates() {
		if (checking) return;
		checking = true;
		updateError = null;
		try {
			await refreshAll();
		} catch {
			updateError = 'Uppdateringen misslyckades. Ladda om sidan för att försöka igen.';
		} finally {
			checking = false;
		}
	}

	function pageTitle(current: PresentationProjection) {
		switch (current.state) {
			case 'invalid':
				return 'Ogiltig möteslänk';
			case 'waiting':
				return `${current.meeting.title} | Väntar på nästa omröstning`;
			case 'ended':
				return `${current.meeting.title} | Mötet är avslutat`;
			case 'closed':
				return `${current.vote.title} | Resultat`;
			case 'active':
				return `${current.vote.title} | ${current.meeting.title}`;
			default:
				return 'Ogiltig möteslänk';
		}
	}

	const title = $derived(pageTitle(projection));
	const participantLink = $derived(new URL(`/m/${data.publicLocator}`, ORIGIN).toString());
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content="Se aktuell omröstning och resultat." />
</svelte:head>

<PresentationView {projection} {participantLink} />

{#if projection.state !== 'invalid' && projection.state !== 'ended'}
	<div class="fixed inset-x-0 bottom-4 flex flex-col items-center gap-2 px-6">
		{#if liveUnavailable}
			<p
				class="rounded-md bg-background/95 px-3 py-2 text-sm text-muted-foreground shadow"
				role="status"
			>
				Liveuppdateringen fungerar inte just nu. Sidan hämtar nya uppgifter automatiskt.
			</p>
		{/if}
		{#if updateError}
			<p class="rounded-md bg-background/95 px-3 py-2 text-sm text-destructive" role="alert">
				{updateError}
			</p>
		{/if}
		<Button type="button" variant="outline" disabled={checking} onclick={checkForUpdates}>
			{checking ? 'Kontrollerar' : 'Kontrollera uppdateringar'}
		</Button>
	</div>
{/if}
