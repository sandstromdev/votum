import { command, form, getRequestEvent } from '$app/server';
import { error, invalid } from '@sveltejs/kit';
import { submitDecisionBallotSchema, submitSelectionBallotSchema } from '#lib/schemas/ballot.js';
import { publicLocatorSchema } from '#lib/schemas/meeting.js';
import { STALE_ACTIVE_VOTE_MESSAGE } from '#lib/vote/ballot.js';
import {
	StaleActiveVoteError,
	submitDecisionBallot as submitDecisionBallotRecord,
	submitSelectionBallot as submitSelectionBallotRecord,
	withdrawDecisionBallot as withdrawDecisionBallotRecord,
	withdrawSelectionBallot as withdrawSelectionBallotRecord
} from '#lib/server/ballot/index.js';
import { getParticipantToken, setParticipantToken } from '#lib/server/participant-token.js';
import { participantMeeting } from './meeting.remote.js';
import z from 'zod';

async function submitOrRejectStale<T>(submit: () => Promise<T>) {
	try {
		return await submit();
	} catch (caught) {
		if (caught instanceof StaleActiveVoteError) invalid(STALE_ACTIVE_VOTE_MESSAGE);
		throw caught;
	}
}

export const submitDecisionBallotForm = form(submitDecisionBallotSchema, async (input) => {
	const event = getRequestEvent();

	const rawParticipantToken = getParticipantToken(event, input.publicLocator);

	if (input.action === 'withdraw') {
		const result = await withdrawDecisionBallotRecord({
			publicLocator: input.publicLocator,
			rawParticipantToken
		});

		if (!result) {
			invalid('Det finns ingen registrerad röst att ta tillbaka.');
		}
	} else {
		const result = await submitOrRejectStale(() =>
			submitDecisionBallotRecord({
				publicLocator: input.publicLocator,
				activeVoteKey: input.activeVoteKey,
				choice: input.choice!,
				rawParticipantToken
			})
		);

		if (!result) invalid('Röstningen är inte längre öppen.');

		if (result.createdToken) {
			setParticipantToken(event, input.publicLocator, result.createdToken);
		}
	}

	participantMeeting({ publicLocator: input.publicLocator }).refresh();

	return { success: true };
});

export const submitSelectionBallotForm = form(submitSelectionBallotSchema, async (input) => {
	const event = getRequestEvent();

	const rawParticipantToken = getParticipantToken(event, input.publicLocator);

	if (input.action === 'withdraw') {
		const result = await withdrawSelectionBallotRecord({
			publicLocator: input.publicLocator,
			rawParticipantToken
		});

		if (!result) {
			invalid('Det finns ingen registrerad röst att ta tillbaka.');
		}
	} else {
		const result = await submitOrRejectStale(() =>
			submitSelectionBallotRecord({
				publicLocator: input.publicLocator,
				activeVoteKey: input.activeVoteKey,
				selectedOptionIds: input.selectedOptionIds,
				vacancyCount: input.vacancyCount,
				abstain: input.abstain,
				rawParticipantToken
			})
		);

		if (!result) invalid('Röstningen är inte längre öppen.');

		if (result.createdToken) {
			setParticipantToken(event, input.publicLocator, result.createdToken);
		}
	}

	participantMeeting({ publicLocator: input.publicLocator }).refresh();

	return { success: true };
});

export const withdrawDecisionBallot = command(
	z.object({ publicLocator: publicLocatorSchema }),
	async (input) => {
		const event = getRequestEvent();
		const result = await withdrawDecisionBallotRecord({
			...input,
			rawParticipantToken: getParticipantToken(event, input.publicLocator)
		});
		if (!result) error(409, 'Röstningen är inte längre öppen.');

		participantMeeting({ publicLocator: input.publicLocator }).refresh();
		return result;
	}
);

export const withdrawSelectionBallot = command(
	z.object({ publicLocator: publicLocatorSchema }),
	async (input) => {
		const event = getRequestEvent();
		const result = await withdrawSelectionBallotRecord({
			...input,
			rawParticipantToken: getParticipantToken(event, input.publicLocator)
		});
		if (!result) error(409, 'Röstningen är inte längre öppen.');

		participantMeeting({ publicLocator: input.publicLocator }).refresh();
		return result;
	}
);
