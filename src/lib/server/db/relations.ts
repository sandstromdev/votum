import { defineRelations } from 'drizzle-orm';
import * as authSchema from './schema/auth';
import * as meetingSchema from './schema/meeting';
import * as outcomeSchema from './schema/outcome';
import * as participationSchema from './schema/participation';
import * as voteSchema from './schema/vote';

export const relations = defineRelations(
	{
		...authSchema,
		...meetingSchema,
		...voteSchema,
		...participationSchema,
		...outcomeSchema
	},
	(r) => ({
		user: {
			sessions: r.many.session(),
			accounts: r.many.account(),
			meetings: r.many.meeting()
		},
		session: {
			user: r.one.user({
				from: r.session.userId,
				to: r.user.id
			})
		},
		account: {
			user: r.one.user({
				from: r.account.userId,
				to: r.user.id
			})
		},
		meeting: {
			organizer: r.one.user({
				from: r.meeting.organizerUserId,
				to: r.user.id
			}),
			votes: r.many.vote(),
			participantTokens: r.many.participantToken(),
			ballots: r.many.ballot(),
			outcomeSnapshots: r.many.outcomeSnapshot(),
			participantTokenAnomalies: r.many.participantTokenAnomaly()
		},
		vote: {
			meeting: r.one.meeting({
				from: r.vote.meetingId,
				to: r.meeting.id
			}),
			rerunOf: r.one.vote({
				from: r.vote.rerunOfVoteId,
				to: r.vote.id,
				optional: true
			}),
			decisionConfig: r.one.decisionVoteConfig({
				from: r.vote.id,
				to: r.decisionVoteConfig.voteId,
				optional: true
			}),
			selectionConfig: r.one.selectionVoteConfig({
				from: r.vote.id,
				to: r.selectionVoteConfig.voteId,
				optional: true
			}),
			selectionOptions: r.many.selectionOption(),
			ballots: r.many.ballot(),
			outcomeSnapshot: r.one.outcomeSnapshot({
				from: r.vote.id,
				to: r.outcomeSnapshot.voteId,
				optional: true
			}),
			participantTokenAnomalies: r.many.participantTokenAnomaly()
		},
		decisionVoteConfig: {
			vote: r.one.vote({
				from: r.decisionVoteConfig.voteId,
				to: r.vote.id
			})
		},
		selectionVoteConfig: {
			vote: r.one.vote({
				from: r.selectionVoteConfig.voteId,
				to: r.vote.id
			})
		},
		selectionOption: {
			vote: r.one.vote({
				from: r.selectionOption.voteId,
				to: r.vote.id
			})
		},
		participantToken: {
			meeting: r.one.meeting({
				from: r.participantToken.meetingId,
				to: r.meeting.id
			}),
			ballots: r.many.ballot()
		},
		ballot: {
			meeting: r.one.meeting({
				from: r.ballot.meetingId,
				to: r.meeting.id
			}),
			vote: r.one.vote({
				from: r.ballot.voteId,
				to: r.vote.id
			}),
			participantToken: r.one.participantToken({
				from: r.ballot.participantTokenId,
				to: r.participantToken.id
			})
		},
		participantTokenAnomaly: {
			meeting: r.one.meeting({
				from: r.participantTokenAnomaly.meetingId,
				to: r.meeting.id,
				optional: true
			}),
			vote: r.one.vote({
				from: r.participantTokenAnomaly.voteId,
				to: r.vote.id,
				optional: true
			})
		},
		outcomeSnapshot: {
			meeting: r.one.meeting({
				from: r.outcomeSnapshot.meetingId,
				to: r.meeting.id
			}),
			vote: r.one.vote({
				from: r.outcomeSnapshot.voteId,
				to: r.vote.id
			})
		}
	})
);
