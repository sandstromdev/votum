import { z } from 'zod';

export const GENERIC_AUTH_ERROR_MESSAGE =
	'Inloggningen kunde inte genomföras. Kontrollera uppgifterna och försök igen.';

export const loginSchema = z.object({
	email: z
		.string()
		.trim()
		.pipe(z.email('Ange en giltig e-postadress, till exempel namn@exempel.se.')),
	_password: z.string().min(1, 'Ange ditt lösenord.')
});
