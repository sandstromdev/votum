import { v7 as uuidv7, v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { submitDecisionBallotSchema, submitSelectionBallotSchema } from './ballot.js';

describe('Ballot schemas', () => {
	it('requires a choice when casting a Decision Ballot but not an initial key', () => {
		expect(
			submitDecisionBallotSchema.safeParse({ publicLocator: 'meeting-code', action: 'cast' })
		).toMatchObject({ success: false });
		expect(
			submitDecisionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				action: 'cast',
				choice: 'support'
			})
		).toMatchObject({ success: true });
		expect(
			submitDecisionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				action: 'cast',
				choice: 'support',
				initialSubmissionKey: ''
			})
		).toMatchObject({ success: true });

		expect(
			submitDecisionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				action: 'cast',
				choice: 'support',
				initialSubmissionKey: uuidv4()
			})
		).toMatchObject({ success: true });

		expect(
			submitDecisionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				action: 'cast',
				choice: 'support',
				initialSubmissionKey: 'malformed-key'
			})
		).toMatchObject({ success: false });

		expect(
			submitDecisionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				action: 'withdraw'
			})
		).toMatchObject({ success: true });
	});

	it('requires UUIDv7 Selection option ids and rejects duplicates', () => {
		const firstOptionId = uuidv7();
		const secondOptionId = uuidv7();

		expect(
			submitSelectionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				selectedOptionIds: [firstOptionId, secondOptionId],
				vacancyCount: 0,
				action: 'cast'
			})
		).toMatchObject({ success: true });

		expect(
			submitSelectionBallotSchema.safeParse({
				publicLocator: 'meeting-code',
				activeVoteKey: 'shown-vote',
				selectedOptionIds: ['not-a-uuid'],
				vacancyCount: 0,
				action: 'cast'
			})
		).toMatchObject({ success: false });

		const duplicate = submitSelectionBallotSchema.safeParse({
			publicLocator: 'meeting-code',
			activeVoteKey: 'shown-vote',
			selectedOptionIds: [firstOptionId, firstOptionId],
			vacancyCount: 0,
			action: 'cast'
		});

		expect(duplicate).toMatchObject({ success: false });
		if (duplicate.success) {
			return;
		}
		expect(duplicate.error.issues.map((issue) => issue.path)).toContainEqual(['selectedOptionIds']);
	});
});
