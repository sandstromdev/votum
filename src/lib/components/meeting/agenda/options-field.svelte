<script lang="ts">
	import { Field, FieldError, FieldLabel } from '#lib/components/ui/field/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import type { RemoteFormField } from '$app/server';
	import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-svelte';
	import { tick } from 'svelte';

	type OptionsField = RemoteFormField<string[]> & {
		[index: number]: RemoteFormField<string>;
	};

	let {
		idPrefix,
		field,
		initialValues = [],
		vacancyEnabled = false
	}: {
		idPrefix: string;
		field: OptionsField;
		initialValues?: string[];
		vacancyEnabled?: boolean;
	} = $props();

	// The initial props intentionally seed local state.
	// svelte-ignore state_referenced_locally
	const startingValues =
		initialValues.length > 0
			? initialValues
			: (field.value() ?? []).filter((value): value is string => value !== undefined);
	let items = $state<string[]>(startingValues.length > 0 ? [...startingValues] : ['']);

	function sync(next: string[]) {
		items = next;
		field.set(next);
	}

	function focusItem(index: number) {
		const input = document.getElementById(`${idPrefix}-${index}`);

		if (input instanceof HTMLInputElement) {
			input.focus();
		}
	}

	function updateItem(index: number, event: Event) {
		const input = event.currentTarget;

		if (!(input instanceof HTMLInputElement)) {
			return;
		}
		const next = [...items];

		next[index] = input.value;
		sync(next);
	}

	async function addItem(afterIndex = items.length - 1) {
		const index = afterIndex + 1;
		const next = [...items.slice(0, index), '', ...items.slice(index)];

		sync(next);
		await tick();
		focusItem(index);
	}

	async function removeItem(index: number) {
		if (items.length === 1) {
			sync(['']);
			await tick();
			focusItem(0);

			return;
		}

		const next = items.filter((_, itemIndex) => itemIndex !== index);

		sync(next);
		await tick();
		focusItem(Math.min(index, next.length - 1));
	}

	async function moveItem(index: number, direction: -1 | 1) {
		const targetIndex = index + direction;

		if (targetIndex < 0 || targetIndex >= items.length) {
			return;
		}

		const next = [...items];
		const current = next[index] ?? '';

		next[index] = next[targetIndex] ?? '';
		next[targetIndex] = current;
		sync(next);
		await tick();
		focusItem(targetIndex);
	}

	async function handleKeydown(event: KeyboardEvent, index: number) {
		if (
			event.key !== 'Enter' ||
			event.shiftKey ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.isComposing ||
			event.repeat
		) {
			return;
		}

		event.preventDefault();
		await addItem(index);
	}

	// Keep the remote field in sync with the local list on mount.
	// svelte-ignore state_referenced_locally
	field.set(items);
</script>

<Field class="gap-2">
	<FieldLabel>Alternativ</FieldLabel>

	<div class="space-y-2">
		{#each items as item, index (index)}
			<div class="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2">
				<span class="size-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true"></span>
				<Input
					{...field[index].as('text', item)}
					id={`${idPrefix}-${index}`}
					required
					placeholder={index === 0 ? 't.ex. Anna Andersson' : `Alternativ ${index + 1}`}
					oninput={(event) => updateItem(index, event)}
					onkeydown={(event) => handleKeydown(event, index)}
					aria-label={`Alternativ ${index + 1}`}
					class="bg-background"
				/>
				<div class="flex shrink-0 items-center gap-0.5">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={index === 0}
						aria-label={`Flytta alternativ ${index + 1} upp`}
						onclick={() => moveItem(index, -1)}
					>
						<IconArrowUp />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={index === items.length - 1}
						aria-label={`Flytta alternativ ${index + 1} ner`}
						onclick={() => moveItem(index, 1)}
					>
						<IconArrowDown />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Ta bort alternativ ${index + 1}`}
						onclick={() => removeItem(index)}
					>
						<IconTrash />
					</Button>
				</div>
			</div>
		{/each}

		{#if vacancyEnabled}
			{@render ghostRow('Vakant')}
		{/if}
		{@render ghostRow('Avstå')}
	</div>

	<Button
		type="button"
		variant="outline"
		size="sm"
		class="w-full sm:w-auto"
		onclick={() => addItem()}
	>
		<IconPlus class="size-4" />
		Lägg till alternativ
	</Button>

	<FieldError errors={field.issues()} />
</Field>

{#snippet ghostRow(label: string)}
	<div
		class="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/10 p-2"
	>
		<span class="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
		<Input
			value={label}
			disabled
			tabindex={-1}
			aria-label={label}
			class="bg-muted/40 text-muted-foreground"
		/>
	</div>
{/snippet}
