<script lang="ts">
	import Copyright from '#lib/components/copyright.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head>
	<title>votum</title>
	<meta name="description" content="Planera möten, öppna omröstningar och visa resultat." />
</svelte:head>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<main class="flex flex-1 items-center">
		<div class="mx-auto w-full max-w-md px-6 py-10">
			<section class="w-full rounded-lg border border-border bg-card p-6 sm:p-8">
				<h1 class="text-3xl font-semibold tracking-tight">votum.</h1>
				<p class="mt-4 text-sm leading-6 text-muted-foreground">En plattform för enklare möten.</p>
				<Button href="/logga-in" size="lg" class="mt-7 w-full">Logga in</Button>
			</section>
		</div>
	</main>

	<footer class="border-t border-border px-6 py-10">
		<div class="text-center">
			<Copyright class="mx-auto" />
		</div>
	</footer>
</div>
