import { createHash } from 'node:crypto';

export function createActiveVoteKey(voteId: string) {
	// The client can detect a changed activation without receiving the internal Vote id.
	return createHash('sha256').update(voteId).digest('hex');
}
