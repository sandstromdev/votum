# Self-hosting

The production image is a SvelteKit adapter-node server. PostgreSQL is a second container with a disk that survives deploys.

Build `Dockerfile`. Publish port `3000`. Health-check `GET /api/health`. Start with `node scripts/server/migrate.mjs && exec node build`.

That start command applies the SQL in this image, then starts the app. If migrate fails, the process never comes up, so the new container cannot go healthy. Do not run migrate from a pre-deploy hook on the live container. That hook still has the old image, so it cannot apply SQL that only exists in the new one.

## Environment variables

Set these on the host. Do not commit production values.

```text
DATABASE_URL=postgres://<user>:<password>@<private-postgres-host>:5432/<database>
ORIGIN=https://votum.example
BETTER_AUTH_SECRET=<at least 32 random characters>
SENTRY_DSN=<optional>
SENTRY_ORG=<optional, source maps>
SENTRY_PROJECT=<optional, source maps>
SENTRY_AUTH_TOKEN=<optional, source maps>
```

The image already sets `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` for the reverse proxy. Leave PostgreSQL off the public internet. No public hostname, no host port.

## First deploy

1. Create PostgreSQL with persistent storage.
2. Build and run the image. Point a public hostname at port `3000`. Set the variables above.
3. In the logs you should see `Database migrations applied.` Then the container should become healthy.
4. Create the first Organizer. Set `SETUP_USER_EMAIL`, `SETUP_USER_PASSWORD`, and `SETUP_USER_NAME`, then run `node scripts/server/setup-user.mjs` in the application container.
5. Delete the `SETUP_USER_*` variables.
6. Open `https://<your-origin>/api/health`. Expect HTTP 200. Sign in.

## Backups

Back up PostgreSQL. Encrypted object storage, daily dumps, seven days of retention.

Skip immutable retention until you know how you will expire locked objects. Locked backups are a pain to delete.

One successful backup is not a restore test. Restore a dump into a throwaway database and start the app against it.

## Migrations

Generate SQL locally:

```sh
bun run db:generate
bun run db:migrate
```

The image applies the files in `drizzle/` before it starts:

```sh
node scripts/server/migrate.mjs && exec node build
```

That is Drizzle ORM on committed SQL. It is not `db:push`. If a deploy dies mid-migrate, run `node scripts/server/migrate.mjs` from the application container.
