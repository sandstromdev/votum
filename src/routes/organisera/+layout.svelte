<script lang="ts">
	import Copyright from '#lib/components/copyright.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { logout } from '#lib/remotes/auth.remote.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	let { data, children } = $props();
</script>

<div class="flex min-h-screen flex-col bg-background">
	<header class="border-b border-border">
		<div
			class="mx-auto flex w-full max-w-6xl flex-1 items-center justify-between px-6 py-4 lg:px-10"
		>
			<a href="/organisera" class="text-lg font-semibold tracking-[-0.025em]">votum.</a>

			<form {...logout} hidden></form>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							class="flex h-auto flex-col items-end gap-0 rounded-xl px-3 py-2"
						>
							<p class="text-sm">{data.organizer.name}</p>
							<p class="text-xs font-normal text-foreground/50">{data.organizer.email}</p>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					<DropdownMenu.Item
						variant="destructive"
						disabled={logout.pending > 0}
						onSelect={() => logout.submit()}
					>
						{logout.pending > 0 ? 'Loggar ut' : 'Logga ut'}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-6 py-6 lg:px-10">
		{@render children()}
	</main>

	<footer class="border-t border-border px-6 py-10">
		<div class="text-center">
			<Copyright class="mx-auto" />
		</div>
	</footer>
</div>
