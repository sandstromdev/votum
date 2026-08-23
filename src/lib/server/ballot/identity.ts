import { createHash, randomBytes } from 'node:crypto';

export function hashParticipantToken(rawParticipantToken: string) {
	return createHash('sha256').update(rawParticipantToken).digest('hex');
}

export function createParticipantToken() {
	return randomBytes(32).toString('base64url');
}
