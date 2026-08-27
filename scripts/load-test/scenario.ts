import { readParticipant, replaceBallot, submitBallot, withdrawBallot } from './browser.js';
import { measure, runScheduled } from './measure.js';
import type { Config, Participant, Sample } from './types.js';

export async function submitInitialBallots(
	participants: Participant[],
	config: Config,
	samples: Sample[]
) {
	await runScheduled(
		participants,
		config.submitRampMs,
		async (participant) => {
			const result = await measure(samples, 'submit', async () =>
				submitBallot(participant.page, config.timeoutMs, false, samples, 'submit')
			);

			participant.ballotSubmitted = result.outcome === 'success';
		},
		'endpoints'
	);
}

export async function runHoldActions(
	participants: Participant[],
	config: Config,
	samples: Sample[]
) {
	const replaceLimit = config.withdrawPercent + config.replacePercent;

	await runScheduled(participants, config.holdMs, async (participant, index) => {
		const bucket = (index * 37) % 100;

		if (bucket < config.withdrawPercent) {
			if (!participant.ballotSubmitted) {
				return;
			}
			await measure(samples, 'withdraw', async () =>
				withdrawBallot(participant.page, config.timeoutMs)
			);

			return;
		}

		if (bucket < replaceLimit) {
			if (!participant.ballotSubmitted) {
				return;
			}
			await measure(samples, 'replace', async () =>
				replaceBallot(participant.page, config.timeoutMs, samples)
			);

			return;
		}

		if (bucket < replaceLimit + config.readPercent) {
			await measure(samples, 'read', async () =>
				readParticipant(participant.page, config.timeoutMs)
			);
		}
	});
}
