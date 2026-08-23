export type OrganizerCommand = { organizerUserId: string };

export type OrganizerAgendaQuery = OrganizerCommand & {
	meetingId: string;
};

export type RemoveDraftVoteCommand = OrganizerAgendaQuery & {
	voteId: string;
};

export type ReorderDraftVotesCommand = OrganizerAgendaQuery & {
	orderedVoteIds: string[];
};
