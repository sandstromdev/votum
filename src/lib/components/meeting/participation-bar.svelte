<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		current,
		expected,
		checking,
		liveStatus,
		onCheck,
		errorMessage,
		onReload
	}: {
		current?: number;
		expected?: number | null;
		checking: boolean;
		liveStatus?: string | null;
		onCheck: () => void;
		errorMessage: string | null;
		onReload: () => void;
	} = $props();
</script>

<div
	class={[
		'mt-8 flex flex-col gap-4 border-t border-border pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center',
		current != null ? 'sm:justify-between' : 'sm:justify-end'
	]}
>
	{#if current != null}
		{#if expected}
			<span>{current} av {expected} deltagare</span>
		{:else}
			<span>{current} deltagare</span>
		{/if}
	{/if}
	<Button type="button" variant="outline" size="sm" disabled={checking} onclick={onCheck}>
		{checking ? 'Kontrollerar' : 'Kontrollera uppdateringar'}
	</Button>
</div>
{#if liveStatus}
	<p class="mt-3 text-sm text-muted-foreground" role="status">{liveStatus}</p>
{/if}
{#if errorMessage}
	<div class="mt-3 flex items-center justify-between gap-3 text-sm text-destructive" role="alert">
		<span>{errorMessage}</span>
		<Button type="button" variant="outline" size="sm" onclick={onReload}>Ladda om</Button>
	</div>
{/if}
