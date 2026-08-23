import z from 'zod';
import { publicLocatorSchema } from '#lib/schemas/meeting.js';

export const meetingLocatorQuerySchema = z.object({
	publicLocator: publicLocatorSchema
});

export const meetingLifecycleCommandSchema = z.object({
	meetingId: z.uuidv7(),
	expectedRevision: z.number().int().nonnegative().optional()
});

export const voteLifecycleCommandSchema = meetingLifecycleCommandSchema.extend({
	voteId: z.uuidv7()
});

export const presentationQrVisibilitySchema = z.object({
	meetingId: z.uuidv7(),
	enabled: z.boolean()
});
