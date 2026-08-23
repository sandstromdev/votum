<script lang="ts">
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Planera möten, öppna omröstningar och visa resultat." />
</svelte:head>

{@render children()}

<Toaster richColors />
<ConfirmDialog />
