<script lang="ts">
	import ClosedVoteResult from '#lib/components/meeting/closed-vote-result.svelte';
	import ParticipationBar from '#lib/components/meeting/participation-bar.svelte';
	import ParticipantVote from '#lib/components/vote/participant.svelte';
	import StatusPage from '#lib/components/status-page.svelte';
	import { participantMeetingLive } from '#lib/remotes/meeting.remote.js';
	import type { ParticipantProjection } from '#lib/vote/meeting.js';
	import { refreshAll } from '$app/navigation';
	import { onDestroy } from 'svelte';

	let { data } = $props();
	const liveProjection = $derived(
		import.meta.env.MODE === 'test'
			? null
			: participantMeetingLive({ publicLocator: data.publicLocator })
	);
	const publicLocator = $derived(data.publicLocator);
	const projection = $derived.by(() => {
		const live = liveProjection?.current;
		if (!live) return data.projection;
		if (live.state === 'invalid')
			return data.projection.state === 'invalid' ? live : data.projection;
		if (data.projection.state === 'invalid') return live;
		return live.revision >= data.projection.revision ? live : data.projection;
	});
	let checking = $state(false);
	let updateError = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let pollDelay = 5_000;

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

	function participantPageTitle(projection: ParticipantProjection) {
		if (projection.state === 'invalid') return 'Ogiltig möteslänk';
		if (projection.state === 'ended') return `${projection.meeting.title} | Mötet är avslutat`;
		if (projection.state === 'closed') return `${projection.vote.title} | Omröstningen är stängd`;
		if (projection.state === 'active')
			return `${projection.vote.title} | ${projection.meeting.title}`;
		return `${projection.meeting.title} | Väntar på nästa omröstning`;
	}

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

	function reloadPage() {
		location.reload();
	}

	const pageTitle = $derived(participantPageTitle(projection));
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content="Rösta anonymt via möteslänken." />
</svelte:head>

{#if projection.state === 'invalid'}
	<StatusPage
		eyebrow="Möteslänk"
		title="Länken kunde inte hittas"
		description={projection.message}
		class="max-w-lg"
	/>
{:else if projection.state === 'ended'}
	<StatusPage
		eyebrow={projection.meeting.title}
		title="Mötet är avslutat"
		description="Det går inte längre att lämna in en röst."
		class="max-w-lg"
	/>
{:else if projection.state === 'closed'}
	<StatusPage
		eyebrow={projection.meeting.title}
		title="Omröstningen är stängd"
		description="Det går inte längre att lämna in en röst."
		class="max-w-lg"
	>
		<div class="text-left">
			<p class="font-medium">{projection.vote.title}</p>
			<ClosedVoteResult {projection} />
			<ParticipationBar
				current={projection.participation.current}
				expected={projection.participation.expected}
				{checking}
				liveStatus={liveUnavailable
					? 'Liveuppdateringen fungerar inte just nu. Sidan hämtar nya uppgifter automatiskt.'
					: null}
				errorMessage={updateError}
				onCheck={checkForUpdates}
				onReload={reloadPage}
			/>
		</div>
	</StatusPage>
{:else if projection.state === 'active'}
	{#key projection.activeVoteKey}
		<ParticipantVote {publicLocator} meetingTitle={projection.meeting.title} {projection}>
			<ParticipationBar
				current={projection.participation.current}
				expected={projection.participation.expected}
				{checking}
				liveStatus={liveUnavailable
					? 'Liveuppdateringen fungerar inte just nu. Sidan hämtar nya uppgifter automatiskt.'
					: null}
				errorMessage={updateError}
				onCheck={checkForUpdates}
				onReload={reloadPage}
			/>
		</ParticipantVote>
	{/key}
{:else}
	<StatusPage
		eyebrow={projection.meeting.title}
		title="Ingen omröstning är aktiv"
		description="Nästa omröstning visas här när den är redo."
		class="max-w-lg"
	>
		<ParticipationBar
			{checking}
			liveStatus={liveUnavailable
				? 'Liveuppdateringen fungerar inte just nu. Sidan hämtar nya uppgifter automatiskt.'
				: null}
			errorMessage={updateError}
			onCheck={checkForUpdates}
			onReload={reloadPage}
		/>
	</StatusPage>
{/if}
