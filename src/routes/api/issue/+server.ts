import { dsnToString, handleTunnelRequest, makeDsn } from '@sentry/core';
import type { RequestHandler } from './$types';
import { SENTRY_DSN } from '$app/env/public';

export const prerender = false;

/** Normalize to the same string the SDK embeds in tunneled envelope headers. */
function normalizeDsn(dsn: string) {
	const components = makeDsn(dsn.trim());
	return components ? dsnToString(components) : null;
}

/**
 * Same-origin proxy for browser Sentry envelopes.
 * Uses Sentry's official tunnel helper so binary envelopes stay intact
 * and upstream ingest URLs include the required auth.
 */
export const POST: RequestHandler = async ({ request }) => {
	const allowed = SENTRY_DSN ? normalizeDsn(SENTRY_DSN) : null;

	if (!allowed) {
		return new Response('Issue reporting not configured.', { status: 503 });
	}

	return handleTunnelRequest({
		request,
		allowedDsns: [allowed]
	});
};
