import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgres://root:mysecretpassword@localhost:5432/local';

export function createServerTestContext() {
	const sql = postgres(DATABASE_URL, { max: 1 });
	const createdMeetingIds: string[] = [];
	const createdOrganizerIds: string[] = [];

	return {
		sql,

		async connect() {
			await sql`SELECT 1`;
		},

		async close() {
			await sql.end();
		},

		async insertOrganizer() {
			const id = randomUUID();

			await sql`
				INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
				VALUES (${id}, 'Organizer', ${`${id}@example.test`}, true, now(), now())
			`;
			createdOrganizerIds.push(id);

			return id;
		},

		trackMeetings(...meetingIds: string[]) {
			createdMeetingIds.push(...meetingIds);
		},

		async getMeetingRevision(meetingId: string) {
			const [row] = await sql`SELECT revision FROM meeting WHERE id = ${meetingId}`;

			if (!row) {
				throw new Error('Expected the Meeting to exist');
			}

			return Number(row.revision);
		},

		async cleanup() {
			const meetingIds = createdMeetingIds.splice(0);

			if (meetingIds.length > 0) {
				await sql.begin(async (transaction) => {
					const ids = sql.array(meetingIds);

					// Bypass the snapshot trigger only for cleanup on this disposable test connection.
					await transaction`SET LOCAL session_replication_role = 'replica'`;
					await transaction`DELETE FROM outcome_snapshot WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`DELETE FROM outcome_resolution WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`DELETE FROM ballot WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`DELETE FROM participant_token WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`UPDATE vote SET rerun_of_vote_id = NULL WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`DELETE FROM decision_vote_config WHERE vote_id IN (SELECT id FROM vote WHERE meeting_id = ANY(${ids}::uuid[]))`;
					await transaction`DELETE FROM selection_vote_config WHERE vote_id IN (SELECT id FROM vote WHERE meeting_id = ANY(${ids}::uuid[]))`;
					await transaction`DELETE FROM selection_option WHERE vote_id IN (SELECT id FROM vote WHERE meeting_id = ANY(${ids}::uuid[]))`;
					await transaction`DELETE FROM vote WHERE meeting_id = ANY(${ids}::uuid[])`;
					await transaction`DELETE FROM meeting WHERE id = ANY(${ids}::uuid[])`;
				});
			}

			const organizerIds = createdOrganizerIds.splice(0);

			if (organizerIds.length > 0) {
				await sql`DELETE FROM "user" WHERE id = ANY(${sql.array(organizerIds)}::text[])`;
			}
		}
	};
}
