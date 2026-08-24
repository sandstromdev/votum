---
status: accepted
---

# Production runtime and recovery

The production app is built as a multi-stage Docker image. Bun builds the SvelteKit app, and Node runs the SvelteKit adapter-node server. The final image contains the production dependencies, the built app, and the committed SQL migrations, but not the development-only Drizzle Kit CLI. The app exposes a database-backed `/api/health` endpoint.

The new container runs `node scripts/server/migrate.mjs` before it starts the SvelteKit server. Do not migrate from a pre-deploy hook on the live container. That hook still runs the old image, so it cannot apply SQL that only exists in the new one. If the migrator fails, the new container never becomes healthy. Production does not run `db:push`. PostgreSQL is external to the application container, and the deployment environment owns its storage and backup mechanisms.

Recovery depends on the PostgreSQL provider. Votum does not manage database backups or retention. A self-hosted deployment must choose and test its own backup and restore process. A managed deployment should use and verify the provider's backup and restore facilities.
