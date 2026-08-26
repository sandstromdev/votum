<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		checking,
		liveStatus,
		onCheck,
		errorMessage,
		onReload
	}: {
		checking: boolean;
		liveStatus?: string | null;
		onCheck: () => void;
		errorMessage: string | null;
		onReload: () => void;
	} = $props();
</script>

<div
	class="mt-8 flex flex-col gap-4 border-t border-border pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
>
	<Button type="button" variant="ghost" size="sm" disabled={checking} onclick={onCheck}>
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
