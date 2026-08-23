<script lang="ts">
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/icons/favicon.ico" sizes="any" />
	<link rel="icon" href="/icons/favicon-16x16.png" type="image/png" sizes="16x16" />
	<link rel="icon" href="/icons/favicon-32x32.png" type="image/png" sizes="32x32" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" />
	<meta name="description" content="Planera möten, öppna omröstningar och visa resultat." />
</svelte:head>

{@render children()}

<Toaster richColors />
<ConfirmDialog />
