<script lang="ts">
	import StatusPage from '#lib/components/status-page.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { page } from '$app/state';
	import { IconArrowLeft } from '@tabler/icons-svelte';
</script>

<svelte:head>
	<title>{page.status} | Något gick fel</title>
</svelte:head>

<StatusPage
	eyebrow="Fel {page.status}"
	title="Något gick fel"
	description={page.error?.message ?? 'Ett oväntat fel uppstod.'}
>
	<Button class="mt-8" variant="outline" href="/">
		<IconArrowLeft class="size-4" />
		Tillbaka
	</Button>
</StatusPage>
