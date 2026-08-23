<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		cancelConfirmDialog,
		confirmConfirmDialog,
		completeConfirmDialog,
		getConfirmDialogState,
		requestCancelConfirmDialog,
		setConfirmDialogReason
	} from '#lib/confirm-dialog.svelte.js';

	const dialog = getConfirmDialogState();
	let closingDialogId = $state<number | null>(null);
	let closingAction = $state<'cancel' | 'confirm' | null>(null);

	function handleOpenChange(open: boolean) {
		if (!open) {
			closingAction = 'cancel';
			closingDialogId = requestCancelConfirmDialog();
		}
	}

	function requestClose() {
		closingAction = 'cancel';
		closingDialogId = requestCancelConfirmDialog();
	}

	async function confirm() {
		const dialogId = await confirmConfirmDialog();
		if (dialogId !== null) {
			closingAction = 'confirm';
			closingDialogId = dialogId;
		}
	}

	function handleOpenChangeComplete(open: boolean) {
		if (!open && closingDialogId !== null) {
			if (closingAction === 'confirm') {
				completeConfirmDialog(closingDialogId);
			} else {
				cancelConfirmDialog(closingDialogId);
			}
			closingDialogId = null;
			closingAction = null;
		}
	}
</script>

<AlertDialog.Root
	open={dialog.open}
	onOpenChange={handleOpenChange}
	onOpenChangeComplete={handleOpenChangeComplete}
>
	{#if dialog.options}
		{@const options = dialog.options}
		<AlertDialog.Content size="sm">
			<AlertDialog.Header>
				<AlertDialog.Title>{options.title}</AlertDialog.Title>
				{#if options.description}
					<AlertDialog.Description>{options.description}</AlertDialog.Description>
				{/if}
			</AlertDialog.Header>

			{#if options.inputType}
				<Field.Field class="gap-2">
					<Field.Label for="confirm-dialog-reason">Anledning</Field.Label>
					{#if options.inputType === 'textarea'}
						<Textarea
							id="confirm-dialog-reason"
							value={dialog.reason}
							oninput={(event) => setConfirmDialogReason(event.currentTarget.value)}
							placeholder={options.placeholder}
							autocomplete="off"
							autofocus
						/>
					{:else}
						<Input
							id="confirm-dialog-reason"
							value={dialog.reason}
							oninput={(event) => setConfirmDialogReason(event.currentTarget.value)}
							placeholder={options.placeholder}
							autocomplete="off"
							autofocus
						/>
					{/if}
				</Field.Field>
			{/if}

			<AlertDialog.Footer>
				<Button type="button" variant="outline" disabled={dialog.loading} onclick={requestClose}
					>{options.cancelLabel ?? 'Avbryt'}</Button
				>
				<Button
					type="button"
					disabled={dialog.loading ||
						(dialog.options?.inputType !== undefined && dialog.reason.trim() === '')}
					onclick={() => void confirm()}>{options.confirmLabel ?? 'Bekräfta'}</Button
				>
			</AlertDialog.Footer>
			{#if dialog.loading}
				<p class="text-sm text-muted-foreground" role="status">Sparar</p>
			{/if}
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
