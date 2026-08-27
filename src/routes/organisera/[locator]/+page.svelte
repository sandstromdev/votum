<script lang="ts">
	import AgendaEditor from '#lib/components/meeting/agenda/agenda-editor.svelte';
	import MeetingLifecycleControls from '#lib/components/meeting/meeting-lifecycle-controls.svelte';
	import MeetingSettings from '#lib/components/meeting/meeting-settings.svelte';
	import OutcomeHistory from '#lib/components/meeting/outcome-history.svelte';
	import CopyButton from '#lib/components/ui/copy-button/copy-button.svelte';
	import { organizerMeetingLive } from '#lib/remotes/meeting.remote.js';
	import { ORIGIN } from '$app/env/public';
	import { refreshAll } from '$app/navigation';
	import { IconArrowLeft } from '@tabler/icons-svelte';
	import { onDestroy } from 'svelte';
	import { LIFECYCLE_LABELS } from '#lib/vote/meeting.js';

	let { data } = $props();

	const liveMeeting = $derived(
		import.meta.env.MODE === 'test'
			? null
			: organizerMeetingLive({ publicLocator: data.meeting.publicLocator })
	);
	const meeting = $derived(
		liveMeeting?.current && liveMeeting.current.revision >= data.meeting.revision
			? liveMeeting.current
			: data.meeting
	);
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	let pollDelay = 5_000;
	const liveUnavailable = $derived(Boolean(liveMeeting?.done || liveMeeting?.error));

	function stopPolling() {
		if (pollTimer) {
			clearTimeout(pollTimer);
		}
		pollTimer = undefined;
	}

	function schedulePolling() {
		if (pollTimer || liveMeeting?.connected || !liveUnavailable) {
			return;
		}

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
		if (liveMeeting?.connected) {
			stopPolling();
		} else if (liveUnavailable) {
			schedulePolling();
		}
	});

	onDestroy(stopPolling);

	const lifecycleLabel = $derived(LIFECYCLE_LABELS[meeting.lifecycle]);

	const participantLink = $derived(new URL(meeting.participantPath, ORIGIN).toString());
</script>

<svelte:head>
	<title>{meeting.title} | votum</title>
</svelte:head>

{#key meeting.id}
	<div class="mx-auto max-w-xl space-y-8">
		<div>
			<a
				class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				href="/organisera"
			>
				<IconArrowLeft class="size-4" aria-hidden="true" />
				Tillbaka till möten
			</a>

			<div class="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
				<div class="space-y-2">
					<p class="text-sm font-medium tracking-wide text-primary uppercase">Hantera möte</p>
					<h1 class="text-3xl font-semibold tracking-tight">{meeting.title}</h1>
					<p class="text-sm text-muted-foreground">{lifecycleLabel}</p>
				</div>
				{#if liveUnavailable}
					<p class="text-sm text-muted-foreground" role="status">
						Liveuppdateringen fungerar inte just nu. Sidan hämtar nya uppgifter automatiskt.
					</p>
				{/if}
				{#if meeting.lifecycle !== 'draft'}
					<div class="flex flex-wrap justify-end gap-2">
						<CopyButton text={participantLink}>Kopiera deltagarlänk</CopyButton>
						<a
							class="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
							href={meeting.presentationPath}
						>
							Öppna presentationsvy
						</a>
					</div>
				{/if}
			</div>
		</div>

		<div class="space-y-6">
			<MeetingSettings {meeting} />
			<MeetingLifecycleControls {meeting} />
			<OutcomeHistory {meeting} />
			<AgendaEditor {meeting} />
		</div>
	</div>
{/key}
