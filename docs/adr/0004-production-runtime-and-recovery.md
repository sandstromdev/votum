---
status: accepted
---

# Production runtime and recovery

The production app is built as a multi-stage Docker image. Bun builds the SvelteKit app, and Node runs the SvelteKit adapter-node server. The final image contains the production dependencies, the built app, and the committed SQL migrations, but not the development-only Drizzle Kit CLI. The app exposes a database-backed `/api/health` endpoint.

The new container runs `node scripts/server/migrate.mjs` before it starts the SvelteKit server. Do not migrate from a pre-deploy hook on the live container. That hook still runs the old image, so it cannot apply SQL that only exists in the new one. If the migrator fails, the new container never becomes healthy. Production does not run `db:push`. PostgreSQL is a separate service with persistent disks.

PostgreSQL and the app share a host for now. If that host dies, restore from backup. Daily encrypted PostgreSQL dumps are kept for seven days. Skip immutable retention. Locked objects cannot be deleted until the lock expires, and that is more operational pain than the current recovery plan needs.
