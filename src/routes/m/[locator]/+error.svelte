<script lang="ts">
	import StatusPage from '#lib/components/status-page.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { page } from '$app/state';
	import { IconArrowLeft, IconRefresh } from '@tabler/icons-svelte';

	function reloadPage() {
		location.reload();
	}
</script>

<svelte:head>
	<title>{page.status} | Något gick fel</title>
</svelte:head>

<StatusPage
	eyebrow="Fel {page.status}"
	title="Något gick fel"
	description={page.error?.message ?? 'Ett oväntat fel uppstod.'}
>
	<div class="mt-8 flex flex-wrap gap-3">
		<Button variant="outline" href="/">
			<IconArrowLeft class="size-4" />
			Tillbaka
		</Button>
		<Button variant="outline" onclick={reloadPage}>
			<IconRefresh class="size-4" />
			Ladda om
		</Button>
	</div>
</StatusPage>
