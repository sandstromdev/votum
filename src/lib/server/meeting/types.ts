import type {
	MeetingLifecycle,
	OrganizerMeeting,
	ParticipantPageProjection,
	ParticipantProjection,
	PresentationProjection
} from '#lib/vote/meeting.js';
import type { IncompleteResolutionType } from '#lib/vote/outcome.js';

export type {
	MeetingLifecycle,
	OrganizerMeeting,
	ParticipantPageProjection,
	ParticipantProjection,
	PresentationProjection
};

export type MeetingInput = {
	organizerUserId: string;
	title: string;
	expectedParticipantCount: number | null;
};

export type MeetingSettingsUpdate = {
	organizerUserId: string;
	meetingId: string;
	settings: Partial<{
		expectedParticipantCount: number | null;
		presentationQrEnabled: boolean;
	}>;
};

export type MeetingLifecycleCommand = {
	organizerUserId: string;
	meetingId: string;
	expectedRevision?: number;
};

export type VoteLifecycleCommand = MeetingLifecycleCommand & {
	voteId: string;
};

export type PublicResultBreakdownCommand = VoteLifecycleCommand & {
	enabled: boolean;
};

export type IncompleteResolutionCommand = VoteLifecycleCommand & {
	resolutionType: IncompleteResolutionType;
};

export type CommittedMeetingResult<T> = {
	value: T;
	revision: number | null;
};

export type InvalidateVoteCommand = VoteLifecycleCommand & {
	reason: string;
};
