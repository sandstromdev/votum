<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { NumberField } from '#lib/components/ui/number-field/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import {
		deleteMeeting,
		openMeeting,
		setPresentationQrEnabled,
		updateMeetingSettings
	} from '#lib/remotes/meeting.remote.js';
	import type { OrganizerMeeting } from '#lib/vote/meeting.js';
	import { goto, refreshAll } from '$app/navigation';
	import { IconArrowRight, IconTrash } from '@tabler/icons-svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	let {
		meeting
	}: {
		meeting: Pick<
			OrganizerMeeting,
			| 'id'
			| 'lifecycle'
			| 'revision'
			| 'participantPath'
			| 'expectedParticipantCount'
			| 'presentationQrEnabled'
		>;
	} = $props();

	let opening = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let presentationQrEnabled = $derived(meeting.presentationQrEnabled);
	let presentationQrBusy = $state(false);

	let expectedParticipantCount = $state<number | undefined>(
		untrack(() => meeting.expectedParticipantCount ?? undefined)
	);

	const isClosed = $derived(meeting.lifecycle === 'closed');

	const form = updateMeetingSettings.for(untrack(() => meeting.id));

	form.fields.expectedParticipantCount.set(untrack(() => expectedParticipantCount ?? undefined));

	async function openMeetingFromDraft() {
		if (opening) return;
		opening = true;
		try {
			await openMeeting({ meetingId: meeting.id, expectedRevision: meeting.revision });
			await refreshAll();
		} catch {
			toast.error('Mötet kunde inte öppnas. Uppdatera sidan och försök igen.');
		} finally {
			opening = false;
		}
	}

	async function deleteMeetingFromDraft() {
		if (deleting) return;
		deleting = true;
		try {
			await deleteMeeting({ meetingId: meeting.id });
			await goto('/organisera');
		} catch {
			toast.error('Du kan bara ta bort utkast.');
		} finally {
			deleting = false;
			confirmDelete = false;
		}
	}

	async function changePresentationQrEnabled(enabled: boolean) {
		if (presentationQrBusy || isClosed) return;

		const previous = presentationQrEnabled;
		presentationQrEnabled = enabled;
		presentationQrBusy = true;
		try {
			await setPresentationQrEnabled({ meetingId: meeting.id, enabled });
			await refreshAll();
		} catch {
			presentationQrEnabled = previous;
			toast.error('QR-koden kunde inte ändras. Uppdatera sidan och försök igen.');
		} finally {
			presentationQrBusy = false;
		}
	}
</script>

<section class="rounded-lg border border-border bg-card p-6">
	<div class="flex w-full flex-col justify-between gap-4 sm:flex-row">
		<div>
			<p class="text-sm font-medium tracking-wide text-primary uppercase">Inställningar</p>
			<h2 class="mt-1 text-xl font-semibold">Mötesinställningar</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Ändra hur mötet visas och ange ett förväntat deltagarantal.
			</p>
		</div>
		{#if meeting.lifecycle === 'draft'}
			<div class="flex flex-wrap gap-2">
				<Button type="button" onclick={openMeetingFromDraft} loading={opening}>Öppna möte</Button>
				<Button
					type="button"
					variant="outline"
					destructive
					size="icon"
					onclick={() => (confirmDelete = true)}
					loading={deleting}
				>
					<IconTrash />
				</Button>
			</div>
		{:else}
			<Button type="button" variant="outline" disabled>
				{meeting.lifecycle === 'open' ? 'Mötet är öppet' : 'Mötet är avslutat'}
			</Button>
		{/if}
	</div>

	<div class="mt-6 border-t border-border pt-5">
		<form
			{...form.enhance(async ({ submit }) => {
				await submit();
				if (form.result?.success) await refreshAll();
			})}
			class="flex gap-x-6 gap-y-3 sm:flex-col"
		>
			<input {...form.fields.meetingId.as('hidden', meeting.id)} />
			<Field.Field class="min-w-0 gap-2">
				<Field.Label for={`expected-participants-${meeting.id}`}>
					Förväntat antal deltagare
				</Field.Label>

				{#if expectedParticipantCount}
					<input {...form.fields.expectedParticipantCount.as('hidden', expectedParticipantCount)} />
				{/if}

				<div class="flex gap-3">
					<NumberField
						class="!w-40"
						bind:value={expectedParticipantCount}
						placeholder="Tomt"
						disabled={isClosed}
						id={`expected-participants-${meeting.id}`}
					/>
					<Button
						type="submit"
						variant="outline"
						disabled={isClosed}
						loading={form.pending > 0}
						class="w-max"
					>
						Spara
					</Button>
				</div>

				<Field.Description
					>Lämna tomt om du inte vill visa ett uppskattat deltagarantal.</Field.Description
				>

				<Field.Error errors={form.fields.expectedParticipantCount.issues()} />
			</Field.Field>
		</form>
		<p class="mt-3 text-xs text-muted-foreground">
			{isClosed ? 'Mötet är avslutat och inställningarna kan inte längre ändras.' : ''}
		</p>
	</div>

	<div class="mt-5 border-t border-border pt-5">
		<Field.Field orientation="horizontal" class="gap-4">
			<Field.Content>
				<Field.Label for={`presentation-qr-${meeting.id}`}>Visa QR-kod</Field.Label>
				<Field.Description
					>Låt deltagarna skanna QR-koden på skärmen för att öppna möteslänken.</Field.Description
				>
			</Field.Content>
			<Switch
				id={`presentation-qr-${meeting.id}`}
				checked={presentationQrEnabled}
				onCheckedChange={changePresentationQrEnabled}
				disabled={isClosed || presentationQrBusy}
				aria-label="Visa QR-kod på presentationsvyn"
			/>
		</Field.Field>

		{#if presentationQrBusy}
			<p class="mt-2 text-xs text-muted-foreground" role="status">Sparar</p>
		{/if}
	</div>

	{#if meeting.lifecycle !== 'draft'}
		<div class="mt-5 border-t border-border pt-5">
			<a
				class="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
				href={meeting.participantPath}
			>
				Öppna deltagarlänk
				<IconArrowRight class="size-4" aria-hidden="true" />
			</a>
		</div>
	{/if}
</section>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Ta bort möte</AlertDialog.Title>
			<AlertDialog.Description>Är du säker på att du vill ta bort mötet?</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Avbryt</AlertDialog.Cancel>
			<AlertDialog.Action onclick={deleteMeetingFromDraft}>Ta bort</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
