import { render } from 'vitest-browser-svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import ConfirmDialog from './confirm-dialog.svelte';
import {
	cancelConfirmDialog,
	openConfirmDialog,
	type ConfirmDialogOptions
} from '#lib/confirm-dialog.svelte.js';

beforeEach(() => {
	cancelConfirmDialog();
});

it('defers a confirmation callback until the user confirms', async () => {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	const screen = await render(ConfirmDialog);

	openConfirmDialog({
		title: 'Ta bort omröstning',
		description: 'Vill du ta bort omröstningen?',
		onConfirm,
		onCancel
	});

	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	expect(onConfirm).not.toHaveBeenCalled();

	await screen.getByRole('button', { name: 'Bekräfta' }).click();

	expect(onConfirm).toHaveBeenCalledOnce();
	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();

	openConfirmDialog({
		title: 'Avsluta mötet',
		onConfirm,
		onCancel
	});
	await screen.getByRole('button', { name: 'Avbryt' }).click();

	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
	expect(onCancel).toHaveBeenCalledOnce();
});

it('requires and trims a reason before confirming', async () => {
	const onConfirm = vi.fn();
	const options: ConfirmDialogOptions = {
		title: 'Ogiltigförklara omröstning',
		inputType: 'textarea',
		placeholder: 'Skriv en anledning',
		onConfirm: (reason) => onConfirm(reason)
	};
	const screen = await render(ConfirmDialog);

	openConfirmDialog(options);

	const confirm = screen.getByRole('button', { name: 'Bekräfta' });
	const reason = screen.getByRole('textbox', { name: 'Anledning' });
	await expect.element(reason).toHaveFocus();
	await expect.element(confirm).toBeDisabled();

	await reason.fill('   ');
	await expect.element(confirm).toBeDisabled();
	await reason.fill('  Felaktig ordning  ');
	await expect.element(confirm).not.toBeDisabled();
	await confirm.click();

	expect(onConfirm).toHaveBeenCalledWith('Felaktig ordning');
});

it('cancels when Escape is pressed', async () => {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	const screen = await render(ConfirmDialog);

	openConfirmDialog({ title: 'Avsluta mötet', onConfirm, onCancel });
	await userEvent.keyboard('{Escape}');

	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
	expect(onCancel).toHaveBeenCalledOnce();
});

it('keeps the dialog open and shows loading while an async confirmation is pending', async () => {
	let resolveConfirmation!: () => void;
	const onConfirm = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				resolveConfirmation = resolve;
			})
	);
	const screen = await render(ConfirmDialog);

	openConfirmDialog({ title: 'Avsluta mötet', onConfirm });
	const confirm = screen.getByRole('button', { name: 'Bekräfta' });
	await confirm.click();

	expect(onConfirm).toHaveBeenCalledOnce();
	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	await expect.element(confirm).toBeDisabled();
	await expect.element(confirm).toHaveAttribute('data-loading');

	resolveConfirmation();
	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
});

it('keeps the dialog open when confirmation fails', async () => {
	const onConfirm = vi.fn(async () => {
		throw new Error('failed');
	});
	const screen = await render(ConfirmDialog);

	openConfirmDialog({ title: 'Ta bort omröstning', onConfirm });
	await screen.getByRole('button', { name: 'Bekräfta' }).click();

	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Bekräfta' })).not.toBeDisabled();
});
