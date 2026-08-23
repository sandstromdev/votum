import z from 'zod';

const expectedParticipantCount = z.number().int().positive().max(2_147_483_647).optional();

export const publicLocatorSchema = z.string().trim().min(1);

export const createMeetingSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Ange en titel för mötet.')
		.max(200, 'Titeln får vara högst 200 tecken.'),
	expectedParticipantCount
});

export const updateMeetingSettingsSchema = z.object({
	meetingId: z.uuidv7(),
	expectedParticipantCount: expectedParticipantCount
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateExpectedParticipantCountInput = z.infer<typeof updateMeetingSettingsSchema>;
