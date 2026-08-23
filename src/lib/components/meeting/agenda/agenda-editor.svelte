<script lang="ts">
	import AgendaItemEditor from './item-editor.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { openConfirmDialog } from '#lib/confirm-dialog.svelte.js';
	import { deleteVote, reorderVotes } from '#lib/remotes/agenda.remote.js';
	import { compareVotesByOpenedAt, type OrganizerVote } from '#lib/vote/agenda.js';
	import type { OrganizerMeeting } from '#lib/vote/meeting.js';
	import { refreshAll } from '$app/navigation';
	import { IconArrowDown, IconArrowUp, IconPencil, IconTrash } from '@tabler/icons-svelte';

	let { meeting }: { meeting: Pick<OrganizerMeeting, 'id' | 'lifecycle' | 'agenda'> } = $props();

	let formOpen = $state(false);
	let editingVoteId = $state<string | null>(null);
	let editorKey = $state(0);
	let editorDirty = $state(false);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);

	const activeVote = $derived(meeting.agenda.find((agendaVote) => agendaVote.lifecycle === 'open'));
	const draftVotes = $derived(
		meeting.agenda
			.filter((agendaVote) => agendaVote.lifecycle === 'draft')
			.toSorted((left, right) => left.position - right.position)
	);
	const completedVotes = $derived(
		meeting.agenda
			.filter((agendaVote) => agendaVote.lifecycle === 'closed')
			.toSorted(compareVotesByOpenedAt)
	);
	const invalidatedVotes = $derived(
		meeting.agenda
			.filter((agendaVote) => agendaVote.lifecycle === 'invalidated')
			.toSorted(compareVotesByOpenedAt)
	);
	const displayedVotes = $derived([
		...(activeVote ? [activeVote] : []),
		...completedVotes,
		...draftVotes,
		...invalidatedVotes
	]);

	function displayIndex(vote: OrganizerVote) {
		return displayedVotes.findIndex((displayedVote) => displayedVote.id === vote.id) + 1;
	}

	function closeEditor() {
		formOpen = false;
		editingVoteId = null;
		editorDirty = false;
	}

	function startCreate() {
		openEditor(() => {
			editingVoteId = null;
			editorDirty = false;
			errorMessage = null;
			editorKey += 1;
			formOpen = true;
		});
	}

	function startEdit(vote: OrganizerVote) {
		openEditor(() => {
			errorMessage = null;
			editingVoteId = vote.id;
			editorDirty = false;
			editorKey += 1;
			formOpen = true;
		});
	}

	function openEditor(action: () => void) {
		if (!formOpen || !editorDirty) {
			action();
			return;
		}

		openConfirmDialog({
			title: 'Osparade ändringar',
			description: 'Du har osparade ändringar som försvinner. Vill du fortsätta?',
			confirmLabel: 'Fortsätt',
			onConfirm: action
		});
	}

	function setEditorDirty(dirty: boolean) {
		editorDirty = dirty;
	}

	async function moveVote(vote: OrganizerVote, direction: -1 | 1) {
		const index = draftVotes.findIndex((draftVote) => draftVote.id === vote.id);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= draftVotes.length || busy) return;
		const orderedVoteIds = draftVotes.map((draftVote) => draftVote.id);
		[orderedVoteIds[index], orderedVoteIds[nextIndex]] = [
			orderedVoteIds[nextIndex],
			orderedVoteIds[index]
		];
		busy = true;
		errorMessage = null;
		try {
			await reorderVotes({ meetingId: meeting.id, orderedVoteIds });
			await refreshAll();
		} catch {
			errorMessage = 'Agendan kunde inte ändras.';
		} finally {
			busy = false;
		}
	}

	function removeVote(vote: OrganizerVote) {
		if (busy) return;
		openConfirmDialog({
			title: 'Ta bort omröstning',
			description: `Ta bort "${vote.title}" från agendan?`,
			confirmLabel: 'Ta bort',
			onConfirm: () => deleteVoteFromAgenda(vote)
		});
	}

	async function deleteVoteFromAgenda(vote: OrganizerVote) {
		busy = true;
		errorMessage = null;
		try {
			await deleteVote({ meetingId: meeting.id, voteId: vote.id });
			await refreshAll();
			if (editingVoteId === vote.id) closeEditor();
		} catch (error) {
			errorMessage = 'Omröstningen kunde inte tas bort.';
			throw error;
		} finally {
			busy = false;
		}
	}
</script>

<section class="mt-6 border-t border-border pt-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold">Agenda</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Förbered frågorna i den ordning de ska visas.
			</p>
		</div>
		{#if meeting.lifecycle !== 'closed'}
			<Button type="button" variant="outline" onclick={startCreate}>Lägg till omröstning</Button>
		{/if}
	</div>

	{#if errorMessage}
		<p class="mt-5 text-sm text-destructive">{errorMessage}</p>
	{/if}

	{#if formOpen && editingVoteId === null}
		{#key editorKey}
			<AgendaItemEditor
				{meeting}
				voteId={null}
				onCancel={closeEditor}
				onDirtyChange={setEditorDirty}
			/>
		{/key}
	{/if}

	{#if meeting.agenda.length === 0 && !formOpen}
		<p class="mt-5 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
			Agendan är tom.
		</p>
	{:else}
		{#if activeVote}
			<div class="mt-5">
				<h4 class="text-sm font-semibold">Pågående</h4>
				<ol class="mt-3 space-y-3">{@render voteCard(activeVote, displayIndex(activeVote))}</ol>
			</div>
		{/if}

		{#if completedVotes.length > 0}
			<div class="mt-5">
				<h4 class="text-sm font-semibold">Genomförda</h4>
				<ol class="mt-3 space-y-3">
					{#each completedVotes as vote (vote.id)}{@render voteCard(
							vote,
							displayIndex(vote)
						)}{/each}
				</ol>
			</div>
		{/if}

		{#if draftVotes.length > 0}
			<div class="mt-5">
				<h4 class="text-sm font-semibold">Kommande</h4>
				<ol class="mt-3 space-y-3">
					{#each draftVotes as vote (vote.id)}{@render voteCard(vote, displayIndex(vote))}{/each}
				</ol>
			</div>
		{/if}

		{#if invalidatedVotes.length > 0}
			<div class="mt-5">
				<h4 class="text-sm font-semibold">Ogiltigförklarade</h4>
				<ol class="mt-3 space-y-3">
					{#each invalidatedVotes as vote (vote.id)}{@render voteCard(
							vote,
							displayIndex(vote)
						)}{/each}
				</ol>
			</div>
		{/if}
	{/if}
</section>

{#snippet voteCard(vote: OrganizerVote, index: number)}
	{@const draftIndex = draftVotes.findIndex((draftVote) => draftVote.id === vote.id)}
	<li class="rounded-md border border-border p-4" data-testid={`agenda-vote-${vote.id}`}>
		{#if editingVoteId === vote.id}
			{#key editorKey}
				<AgendaItemEditor
					{meeting}
					voteId={vote.id}
					{vote}
					onCancel={closeEditor}
					onDirtyChange={setEditorDirty}
					class="mt-0 border-0 p-0"
				/>
			{/key}
		{:else}
			<div class="flex items-start gap-3">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
					>{index}</span
				>
				<div class="min-w-0 flex-1">
					<p class="font-medium">{vote.title}</p>
					<p class="mt-1 text-xs text-muted-foreground">
						{vote.kind === 'decision' ? 'Beslut' : 'Val'}
						{#if vote.kind === 'selection' && vote.selection}
							{vote.selection.positionCount === 1
								? 'En vinnare'
								: `${vote.selection.positionCount} vinnare`}
						{/if}
					</p>
				</div>
				{#if vote.lifecycle === 'draft' && meeting.lifecycle !== 'closed'}
					<div class="flex shrink-0 gap-1">
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Flytta upp"
							disabled={draftIndex === 0 || busy}
							onclick={() => moveVote(vote, -1)}
						>
							<IconArrowUp />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Flytta ner"
							disabled={draftIndex === draftVotes.length - 1 || busy}
							onclick={() => moveVote(vote, 1)}
						>
							<IconArrowDown />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Redigera omröstning"
							onclick={() => startEdit(vote)}
						>
							<IconPencil />
						</Button>

						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							destructive
							onclick={() => removeVote(vote)}
						>
							<IconTrash />
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</li>
{/snippet}
