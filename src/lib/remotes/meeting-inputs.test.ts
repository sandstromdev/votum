import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { meetingLocatorQuerySchema, presentationQrVisibilitySchema } from './meeting-inputs.js';

describe('Meeting remote inputs', () => {
	it('validates Presentation QR visibility commands', () => {
		expect(
			presentationQrVisibilitySchema.safeParse({ meetingId: uuidv7(), enabled: true }).success
		).toBe(true);
		expect(
			presentationQrVisibilitySchema.safeParse({ meetingId: 'not-a-meeting-id', enabled: true })
				.success
		).toBe(false);
	});

	it('trims and rejects empty Meeting locators', () => {
		expect(meetingLocatorQuerySchema.parse({ publicLocator: ' meeting-code ' })).toEqual({
			publicLocator: 'meeting-code'
		});
		expect(meetingLocatorQuerySchema.safeParse({ publicLocator: ' ' }).success).toBe(false);
	});
});
