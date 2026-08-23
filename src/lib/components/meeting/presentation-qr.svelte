<script lang="ts">
	import Qr from '#lib/components/meeting/qr.svelte';

	let { data, meetingTitle }: { data: string; meetingTitle: string } = $props();
</script>

<aside
	class=" max-w-full shrink-0 rounded-2xl border border-border bg-card p-5 text-center"
	aria-label="Deltagarlänk med QR-kod"
>
	<div class="bg-white p-3" role="img" aria-label="QR-kod till deltagarlänken">
		<Qr {data} class="aspect-square w-full" shape="circle" />
	</div>
	<p class="text-sm font-medium text-muted-foreground">Öppna {meetingTitle}</p>
</aside>
