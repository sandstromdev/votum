import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';

export const prerender = false;

export async function GET() {
	try {
		await db.execute(sql`SELECT 1`);
		return Response.json({ status: 'ok' });
	} catch {
		return Response.json({ status: 'unavailable' }, { status: 503 });
	}
}
