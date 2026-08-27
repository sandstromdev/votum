export type ConfirmDialogOptions = {
	title: string;
	description?: string;
	placeholder?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onCancel?: () => void;
} & (
	| {
			inputType?: undefined;
			onConfirm: () => void | Promise<void>;
	  }
	| {
			inputType: 'text' | 'textarea';
			onConfirm: (reason: string) => void | Promise<void>;
	  }
);

export type ConfirmDialogState = {
	readonly id: number;
	readonly open: boolean;
	readonly loading: boolean;
	readonly reason: string;
	readonly options: ConfirmDialogOptions | null;
};

type ConfirmDialogData = {
	id: number;
	open: boolean;
	loading: boolean;
	reason: string;
	options: ConfirmDialogOptions | null;
};

class ConfirmDialogController {
	#dialog = $state<ConfirmDialogData>({
		id: 0,
		open: false,
		loading: false,
		reason: '',
		options: null
	});
	#nextDialogId = 0;

	get current(): ConfirmDialogState {
		return this.#dialog;
	}

	open(options: ConfirmDialogOptions) {
		this.#dialog.id = ++this.#nextDialogId;
		this.#dialog.options = options;
		this.#dialog.reason = '';
		this.#dialog.loading = false;
		this.#dialog.open = true;
	}

	setReason(reason: string) {
		this.#dialog.reason = reason;
	}

	cancel(dialogId?: number) {
		if (dialogId !== undefined && this.#dialog.id !== dialogId) {
			return;
		}
		if (this.#dialog.loading) {
			return;
		}

		const onCancel = this.#dialog.options?.onCancel;

		this.#clear();
		onCancel?.();
	}

	requestCancel() {
		if (this.#dialog.loading) {
			return null;
		}
		this.#dialog.open = false;

		return this.#dialog.id;
	}

	async confirm() {
		const options = this.#dialog.options;

		if (!options || this.#dialog.loading) {
			return null;
		}

		this.#dialog.loading = true;
		try {
			if (options.inputType) {
				const reason = this.#dialog.reason.trim();

				if (!reason) {
					this.#dialog.loading = false;

					return null;
				}
				await options.onConfirm(reason);
			} else {
				await options.onConfirm();
			}
			this.#dialog.open = false;
			this.#dialog.loading = false;

			return this.#dialog.id;
		} catch {
			this.#dialog.loading = false;

			return null;
		}
	}

	complete(dialogId: number) {
		if (this.#dialog.id === dialogId) {
			this.#clear();
		}
	}

	#clear() {
		this.#dialog.open = false;
		this.#dialog.loading = false;
		this.#dialog.reason = '';
		this.#dialog.options = null;
	}
}

const confirmDialogController = new ConfirmDialogController();

export function openConfirmDialog(options: ConfirmDialogOptions) {
	confirmDialogController.open(options);
}

export function setConfirmDialogReason(reason: string) {
	confirmDialogController.setReason(reason);
}

export function cancelConfirmDialog(dialogId?: number) {
	confirmDialogController.cancel(dialogId);
}

export function requestCancelConfirmDialog() {
	return confirmDialogController.requestCancel();
}

export async function confirmConfirmDialog() {
	return confirmDialogController.confirm();
}

export function completeConfirmDialog(dialogId: number) {
	confirmDialogController.complete(dialogId);
}

export function getConfirmDialogState() {
	return confirmDialogController.current;
}
