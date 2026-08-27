import type { db } from '#lib/server/db/index.js';

export type BallotTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
