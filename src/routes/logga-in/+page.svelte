<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Field, FieldError, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { login } from '#lib/remotes/auth.remote.js';
	import { loginSchema } from '#lib/schemas/auth.js';

	let passwordInput = $state<HTMLInputElement | null>(null);
</script>

<svelte:head>
	<title>Logga in | votum</title>
	<meta name="description" content="Logga in för att förbereda och leda ett möte." />
</svelte:head>

<main class="min-h-screen bg-background text-foreground">
	<div class="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-10">
		<section class="w-full rounded-lg border border-border bg-card p-6 sm:p-8">
			<a href="/" class="text-lg font-semibold tracking-[-0.025em]">votum.</a>
			<div class="mt-6 mb-8">
				<h1 class="text-3xl font-semibold tracking-tight">Logga in</h1>
				<p class="mt-3 text-sm leading-6 text-muted-foreground">
					Logga in för att förbereda nästa omröstning.
				</p>
			</div>

			<form
				{...login.preflight(loginSchema).enhance(async ({ submit }) => {
					await submit();
				})}
			>
				<FieldGroup class="gap-5">
					<Field class="gap-2">
						<FieldLabel for="email">E-postadress</FieldLabel>
						<Input
							{...login.fields.email.as('email')}
							id="email"
							autocomplete="email"
							placeholder="du@exempel.se"
							required
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									passwordInput?.focus();
								}
							}}
						/>
						<FieldError errors={login.fields.email.issues()} />
					</Field>

					<Field class="gap-2">
						<FieldLabel for="password">Lösenord</FieldLabel>
						<Input
							bind:ref={passwordInput}
							{...login.fields._password.as('password')}
							id="password"
							autocomplete="current-password"
							required
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									login.submit();
								}
							}}
						/>
						<FieldError errors={login.fields._password.issues()} />
					</Field>

					<FieldError
						class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-destructive"
						errors={login.fields.allIssues()}
						rootOnly
					/>

					<Button class="h-11 w-full" type="submit" loading={login.pending > 0}>Logga in</Button>
				</FieldGroup>
			</form>

			<p class="mt-6 text-xs leading-5 text-muted-foreground">
				Deltagare ansluter anonymt via möteslänken. Organisatörskontot skapas och hanteras utanför
				appen.
			</p>
		</section>
	</div>
</main>
