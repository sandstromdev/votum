import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { createMeetingSchema, updateMeetingSettingsSchema } from './meeting.js';

describe('Meeting schemas', () => {
	it('validates Meeting titles and positive-or-null expected counts', () => {
		expect(createMeetingSchema.safeParse({ title: '  ' }).success).toBe(false);
		expect(
			createMeetingSchema.safeParse({ title: 'Möte', expectedParticipantCount: 0 }).success
		).toBe(false);
		expect(
			createMeetingSchema.safeParse({ title: 'Möte', expectedParticipantCount: 12 }).success
		).toBe(true);
		expect(
			createMeetingSchema.safeParse({
				title: 'Möte',
				expectedParticipantCount: 2_147_483_648
			}).success
		).toBe(false);
		expect(
			updateMeetingSettingsSchema.safeParse({
				meetingId: uuidv7(),
				expectedParticipantCount: undefined
			}).success
		).toBe(true);
		expect(
			updateMeetingSettingsSchema.safeParse({
				meetingId: '550e8400-e29b-41d4-a716-446655440000'
			}).success
		).toBe(false);
	});
});
