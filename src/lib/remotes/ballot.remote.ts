import { command, form, getRequestEvent } from '$app/server';
import { error, invalid } from '@sveltejs/kit';
import { submitDecisionBallotSchema, submitSelectionBallotSchema } from '#lib/schemas/ballot.js';
import { publicLocatorSchema } from '#lib/schemas/meeting.js';
import {
	isBallotError,
	submitDecisionBallot as submitDecisionBallotRecord,
	submitSelectionBallot as submitSelectionBallotRecord,
	withdrawDecisionBallot as withdrawDecisionBallotRecord,
	withdrawSelectionBallot as withdrawSelectionBallotRecord
} from '#lib/server/ballot/index.js';
import { BALLOT_ERRORS } from '#lib/server/ballot/error.js';
import { getParticipantToken, setParticipantToken } from '#lib/server/participant-token.js';
import { createTimingContext } from '#lib/server/timing.js';
import { participantMeeting } from './meeting.remote.js';
import z from 'zod';

function invalidBallotFormError(caught: unknown): never {
	if (isBallotError(caught)) invalid(BALLOT_ERRORS[caught.code].message);
	throw caught;
}

export const submitDecisionBallotForm = form(submitDecisionBallotSchema, async (input) => {
	const event = getRequestEvent();
	const timing = createTimingContext();

	const rawParticipantToken = getParticipantToken(event, input.publicLocator);

	if (input.action === 'withdraw') {
		const result = await withdrawDecisionBallotRecord({
			publicLocator: input.publicLocator,
			rawParticipantToken,
			timing
		});

		if (!result) {
			invalid('Det finns ingen registrerad röst att ta tillbaka.');
		}
	} else {
		try {
			const result = await submitDecisionBallotRecord({
				publicLocator: input.publicLocator,
				activeVoteKey: input.activeVoteKey,
				choice: input.choice!,
				rawParticipantToken,
				initialSubmissionKey: rawParticipantToken ? undefined : input.initialSubmissionKey,
				timing
			});

			if (!result) invalid('Röstningen är inte längre öppen.');

			if (result.createdToken) {
				setParticipantToken(event, input.publicLocator, result.createdToken);
			}
		} catch (caught) {
			invalidBallotFormError(caught);
		}
	}

	// participantMeeting({ publicLocator: input.publicLocator }).refresh();

	return { success: true };
});

export const submitSelectionBallotForm = form(submitSelectionBallotSchema, async (input) => {
	const event = getRequestEvent();
	const timing = createTimingContext();

	const rawParticipantToken = getParticipantToken(event, input.publicLocator);

	if (input.action === 'withdraw') {
		const result = await withdrawSelectionBallotRecord({
			publicLocator: input.publicLocator,
			rawParticipantToken,
			timing
		});

		if (!result) {
			invalid('Det finns ingen registrerad röst att ta tillbaka.');
		}
	} else {
		try {
			const result = await submitSelectionBallotRecord({
				publicLocator: input.publicLocator,
				activeVoteKey: input.activeVoteKey,
				selectedOptionIds: input.selectedOptionIds,
				vacancyCount: input.vacancyCount,
				abstain: input.abstain,
				rawParticipantToken,
				initialSubmissionKey: rawParticipantToken ? undefined : input.initialSubmissionKey,
				timing
			});

			if (!result) invalid('Röstningen är inte längre öppen.');

			if (result.createdToken) {
				setParticipantToken(event, input.publicLocator, result.createdToken);
			}
		} catch (caught) {
			invalidBallotFormError(caught);
		}
	}

	participantMeeting({ publicLocator: input.publicLocator }).refresh();

	return { success: true };
});

export const withdrawDecisionBallot = command(
	z.object({ publicLocator: publicLocatorSchema }),
	async (input) => {
		const event = getRequestEvent();
		const timing = createTimingContext();
		const result = await withdrawDecisionBallotRecord({
			...input,
			rawParticipantToken: getParticipantToken(event, input.publicLocator),
			timing
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
		const timing = createTimingContext();
		const result = await withdrawSelectionBallotRecord({
			...input,
			rawParticipantToken: getParticipantToken(event, input.publicLocator),
			timing
		});
		if (!result) error(409, 'Röstningen är inte längre öppen.');

		participantMeeting({ publicLocator: input.publicLocator }).refresh();
		return result;
	}
);
