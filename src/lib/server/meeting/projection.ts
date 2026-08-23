import { meeting } from '#lib/server/db/schema/meeting.js';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import { applyIncompleteResolution, type OutcomeHistoryEntry } from '#lib/vote/outcome.js';
import type { OrganizerMeeting } from './types.js';

const PARTICIPANT_PATH_PREFIX = '/m/';
const PRESENTATION_PATH_PREFIX = '/p/';

export const INVALID_MEETING_MESSAGE = 'Möteslänken kunde inte hittas.';

export const organizerMeetingColumns = {
	id: meeting.id,
	title: meeting.title,
	publicLocator: meeting.publicLocator,
	lifecycle: meeting.lifecycle,
	expectedParticipantCount: meeting.expectedParticipantCount,
	presentationQrEnabled: meeting.presentationQrEnabled,
	revision: meeting.revision,
	createdAt: meeting.createdAt
};

type OrganizerMeetingRow = Omit<
	OrganizerMeeting,
	'participantPath' | 'agenda' | 'outcomeHistory' | 'activeBallotCount' | 'presentationPath'
>;

function outcomeHistory(agenda: OrganizerVote[]): OutcomeHistoryEntry[] {
	const rerunChildren = new Map<string, string[]>();
	for (const vote of agenda) {
		if (!vote.rerunOfVoteId) continue;
		const children = rerunChildren.get(vote.rerunOfVoteId) ?? [];
		children.push(vote.id);
		rerunChildren.set(vote.rerunOfVoteId, children);
	}

	return agenda
		.filter((vote): vote is OrganizerVote & { outcome: NonNullable<OrganizerVote['outcome']> } =>
			Boolean(vote.outcome)
		)
		.toSorted(
			(left, right) =>
				right.outcome.document.closedAt.localeCompare(left.outcome.document.closedAt) ||
				right.id.localeCompare(left.id)
		)
		.map((vote) => {
			const document = vote.outcome.document;
			const common = {
				voteId: vote.id,
				title: vote.title,
				ballotCount: document.ballotCount,
				expectedParticipantCount: document.expectedParticipantCount,
				closedAt: document.closedAt,
				revealed: vote.revealed ?? false,
				invalidated: vote.lifecycle === 'invalidated',
				rerunOfVoteId: vote.rerunOfVoteId ?? null,
				rerunVoteIds: rerunChildren.get(vote.id) ?? [],
				resolution: vote.resolution ?? null
			};
			if (document.outcome.kind === 'decision') {
				if (!('support' in document.counts))
					throw new Error('Decision history has Selection counts.');
				if (document.vote.kind !== 'decision')
					throw new Error('Decision history has Selection Vote.');
				return {
					...common,
					kind: 'decision' as const,
					outcome: document.outcome,
					counts: document.counts,
					majorityRule: document.vote.decision.majorityRule,
					abstentionsCounted: document.vote.decision.abstentionsCounted
				};
			}
			if (!('options' in document.counts))
				throw new Error('Selection history has Decision counts.');
			return {
				...common,
				kind: 'selection' as const,
				outcome: {
					kind: 'selection' as const,
					...applyIncompleteResolution(document.outcome, vote.resolution)
				},
				counts: document.counts
			};
		});
}

export function mapOrganizerMeeting(
	row: OrganizerMeetingRow,
	agenda: OrganizerVote[] = [],
	activeBallotCount: number | null = null
) {
	return {
		...row,
		participantPath: `${PARTICIPANT_PATH_PREFIX}${row.publicLocator}`,
		presentationPath: `${PRESENTATION_PATH_PREFIX}${row.publicLocator}`,
		activeBallotCount,
		agenda,
		outcomeHistory: outcomeHistory(agenda)
	};
}
