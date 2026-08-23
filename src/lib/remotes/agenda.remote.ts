import { command, form } from '$app/server';
import { error, invalid } from '@sveltejs/kit';
import { draftVoteSchema } from '#lib/schemas/vote.js';
import { removeDraftVote, reorderDraftVotes, saveDraftVote } from '#lib/server/agenda/index.js';
import { requireOrganizerSession } from '#lib/server/auth/session.js';
import { getOrganizerMeetings } from './meeting.remote.js';
import z from 'zod';

export const saveVote = form(draftVoteSchema, async (input) => {
	// A missing voteId inserts a draft Vote; a present voteId replaces that draft's configuration.
	const { user } = requireOrganizerSession();
	const saved = await saveDraftVote({ organizerUserId: user.id, ...input });
	if (!saved) {
		if (!input.voteId) {
			invalid('Du kan bara skapa utkast.');
		}

		invalid('Mötet kunde inte hittas eller kan inte ändras.');
	}
	getOrganizerMeetings().refresh();
	return { success: true };
});

export const deleteVote = command(
	z.object({
		meetingId: z.uuidv7(),
		voteId: z.uuidv7()
	}),
	async (input) => {
		const { user } = requireOrganizerSession();
		const deleted = await removeDraftVote({ organizerUserId: user.id, ...input });
		if (!deleted) error(409, 'Du kan bara ta bort utkast.');
		getOrganizerMeetings().refresh();
	}
);

export const reorderVotes = command(
	z.object({
		meetingId: z.uuidv7(),
		orderedVoteIds: z.array(z.uuidv7()).min(1)
	}),
	async (input) => {
		const { user } = requireOrganizerSession();
		const reordered = await reorderDraftVotes({ organizerUserId: user.id, ...input });
		if (!reordered) error(409, 'Agendan kunde inte ändras.');
		getOrganizerMeetings().refresh();
	}
);
