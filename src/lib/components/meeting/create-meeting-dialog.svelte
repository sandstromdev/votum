<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Field, FieldError, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import NumberField from '#lib/components/ui/number-field/number-field.svelte';
	import { createDraftMeeting as form } from '#lib/remotes/meeting.remote.js';
	import { createMeetingSchema } from '#lib/schemas/meeting.js';

	let expectedParticipantCount = $state<number | undefined>(undefined);
</script>

<Dialog.Root>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props}>Skapa möte</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<form
			{...form.preflight(createMeetingSchema).enhance(async ({ submit }) => {
				await submit();
			})}
			class="grid gap-6"
		>
			<Dialog.Header>
				<Dialog.Title>Nytt möte</Dialog.Title>
			</Dialog.Header>

			<FieldGroup class="gap-5 py-2">
				<Field class="gap-2">
					<FieldLabel for="meeting-title">Titel</FieldLabel>
					<Input
						{...form.fields.title.as('text')}
						id="meeting-title"
						placeholder="Till exempel Årsmöte"
						required
					/>
					<FieldError errors={form.fields.title.issues()} />
				</Field>

				<Field class="gap-2">
					<FieldLabel for="expected-participants">
						Förväntat antal deltagare <span class="font-normal text-muted-foreground"
							>(valfritt)</span
						>
					</FieldLabel>
					{#if expectedParticipantCount}
						<input
							{...form.fields.expectedParticipantCount.as('hidden', expectedParticipantCount)}
						/>
					{/if}
					<NumberField
						bind:value={expectedParticipantCount}
						placeholder="Tomt"
						class="max-w-40"
						min={0}
					/>

					<FieldError errors={form.fields.expectedParticipantCount.issues()} />
				</Field>

				<FieldError errors={form.fields.allIssues()} rootOnly />
			</FieldGroup>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Avbryt</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" loading={form.pending > 0}>Skapa möte</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
