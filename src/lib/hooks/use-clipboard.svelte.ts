type Options = {
	/** Delay before the copied status is reset. */
	delay: number;
};

/** Copies text and exposes the result as reactive state. */
export class UseClipboard {
	#copiedStatus = $state<'success' | 'failure'>();
	private delay: number;
	private timeout: ReturnType<typeof setTimeout> | undefined = undefined;

	constructor({ delay = 500 }: Partial<Options> = {}) {
		this.delay = delay;
	}

	/** Copies text to the clipboard. */
	async copy(text: string) {
		if (this.timeout) {
			this.#copiedStatus = undefined;
			clearTimeout(this.timeout);
		}

		this.#copiedStatus = await copyText(text);

		this.timeout = setTimeout(() => {
			this.#copiedStatus = undefined;
		}, this.delay);

		return this.#copiedStatus;
	}

	/** Whether the last copy succeeded. */
	get copied() {
		return this.#copiedStatus === 'success';
	}

	/** Result of the latest copy attempt. */
	get status() {
		return this.#copiedStatus;
	}
}

export async function copyText(text: string): Promise<'success' | 'failure'> {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);

			return 'success';
		}

		// Fall back to execCommand when the Clipboard API is unavailable.
		const textArea = document.createElement('textarea');

		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.top = '0';
		textArea.style.left = '0';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		// oxlint-disable-next-line typescript/no-deprecated
		const successful = document.execCommand('copy');

		document.body.removeChild(textArea);

		return successful ? 'success' : 'failure';
	} catch {
		return 'failure';
	}
}
