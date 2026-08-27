import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BETTER_AUTH_SECRET } from '$app/env/private';

export function hashParticipantToken(rawParticipantToken: string) {
	return createHash('sha256').update(rawParticipantToken).digest('hex');
}

export function createParticipantToken() {
	return randomBytes(32).toString('base64url');
}

function getTokenEncryptionKey() {
	// The test fallback keeps direct command tests self-contained. Production startup requires
	// BETTER_AUTH_SECRET through src/env.ts, and the configured value must remain stable for retries.
	const secret =
		BETTER_AUTH_SECRET ||
		(process.env.NODE_ENV === 'test' ? 'votum-test-initial-submission-token-secret' : undefined);

	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is required for initial Ballot retries.');
	}

	return createHash('sha256').update(secret).digest();
}

export function encryptParticipantToken(rawParticipantToken: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(rawParticipantToken, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptParticipantToken(ciphertext: string) {
	const [ivEncoded, authTagEncoded, encryptedTokenEncoded] = ciphertext.split('.');

	if (!ivEncoded || !authTagEncoded || !encryptedTokenEncoded) {
		throw new Error('Invalid encrypted Participant token.');
	}

	const decipher = createDecipheriv(
		'aes-256-gcm',
		getTokenEncryptionKey(),
		Buffer.from(ivEncoded, 'base64url')
	);

	decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));

	return Buffer.concat([
		decipher.update(Buffer.from(encryptedTokenEncoded, 'base64url')),
		decipher.final()
	]).toString('utf8');
}

export function hashInitialSubmissionKey(initialSubmissionKey: string) {
	return hashParticipantToken(initialSubmissionKey);
}

function canonicalInitialSubmissionPayload(payload: unknown) {
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!('type' in payload) ||
		payload.type !== 'selection' ||
		!('selectedOptionIds' in payload) ||
		!Array.isArray(payload.selectedOptionIds) ||
		!payload.selectedOptionIds.every((id): id is string => typeof id === 'string')
	) {
		return payload;
	}

	return {
		...payload,
		selectedOptionIds: [...payload.selectedOptionIds].toSorted()
	};
}

export function hashInitialSubmissionPayload(payload: unknown) {
	return createHash('sha256')
		.update(JSON.stringify(canonicalInitialSubmissionPayload(payload)))
		.digest('hex');
}
