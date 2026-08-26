# Deployment

This guide covers deploying Votum with a container runtime and a PostgreSQL database. The application runs in one container. The database may be hosted by a managed provider or run by you. Put a reverse proxy in front of the application.

For local development, see the setup instructions in [`README.md`](../README.md).

## Database

Votum needs a PostgreSQL connection URL. It does not manage the database host, storage, backups, or retention.

If you use a managed provider, create a database and set `DATABASE_URL` to the provider's connection string. Follow the provider's guidance about SSL, connection pooling, and backups.

If you run PostgreSQL yourself, use persistent storage, keep the database on a private network, and configure backups separately from the database host. Do not publish the PostgreSQL port to the public internet.

## Application image

The `Dockerfile` uses multiple stages:

- Bun installs dependencies and builds the SvelteKit application.
- Node 24 runs the final image in production.

Bun is not required in the production container. The runtime image contains the built application, production dependencies, committed SQL migrations, and the server scripts needed for deployment.

The container starts with this command:

```sh
node scripts/server/migrate.mjs && exec node build
```

The migration script runs first. If it fails, the application does not start and the container cannot become healthy. The image health check requests `GET /api/health` on port `3000`.

Build the image with the repository's `Dockerfile`. Start it with your container platform and make port `3000` available to the reverse proxy.

## Environment variables

Set these variables on the application container. Do not commit production values or copy a local `.env` file into the image.

```text
DATABASE_URL=postgres://<user>:<password>@<postgres-host>:<postgres-port>/<database>
ORIGIN=https://votum.example
BETTER_AUTH_SECRET=<at least 32 random characters>
```

| Variable                        | Required | Purpose                                                                    |
| ------------------------------- | -------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Yes      | Connection URL for the PostgreSQL database.                                |
| `DATABASE_POOL_MAX`             | No       | Maximum Postgres.js connections per application process (default: `20`).   |
| `VOTUM_TIMINGS`                 | No       | Set to `1` to emit structured ballot/live-query timings. Unset by default. |
| `VOTUM_LIVE_UPDATE_DEBOUNCE_MS` | No       | Live-update debounce in milliseconds (default: `500`, range: `0`–`60000`). |
| `ORIGIN`                        | Yes      | Public URL where users access Votum, including `https://`.                 |
| `BETTER_AUTH_SECRET`            | Yes      | Secret used by Better Auth. Use at least 32 high-entropy characters.       |

The Dockerfile sets these container defaults:

```text
HOST=0.0.0.0
PORT=3000
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
```

## First deployment

1. Provision a PostgreSQL database. If you run it yourself, use persistent storage and keep it on a private network.
2. Build the application image from the repository's `Dockerfile`.
3. Start the application container with the required environment variables and publish port `3000` to the reverse proxy.
4. Check the container logs. The migration script should report `Database migrations applied.` The container should then pass its health check.
5. Create the first Organizer. Temporarily add these variables to the application container:

   ```text
   SETUP_USER_EMAIL=<organizer email>
   SETUP_USER_PASSWORD=<password of at least 12 characters>
   SETUP_USER_NAME=<organizer name>
   ```

   Run this command in the application container:

   ```sh
   node scripts/server/setup-user.mjs
   ```

6. Remove the `SETUP_USER_*` variables from the container configuration.
7. Open `https://<your-origin>/api/health` and confirm that it returns HTTP 200. Then sign in.

The setup script reads `DATABASE_URL` and the `SETUP_USER_*` variables from the container environment.

## Updating the application

Build a new image for each application release. Start the new container with the same environment variables and let the image apply its migrations before it serves traffic. Confirm that the new container passes its health check before routing traffic to it.

Do not run migrations from a pre-deploy hook that uses the old application image. That image may not contain the SQL files required by the new release.

Production runs the committed SQL migrations in `drizzle/`. Do not use `db:push` in production.

`VOTUM_TIMINGS=1` is intended for short diagnostic runs. It writes JSON timing events to the
application logs for ballot transactions, ballot activity publication, and organizer live-query
reads/yields. The events contain an operation, duration, outcome, and correlation ID. They do not
contain tokens, form payloads, cookies, or user data. The timing context accepts a typed sink for
tests and future log-dump/API adapters; the default adapter writes one JSON object per event to the
application log. Remove the variable after the diagnostic run.

`VOTUM_LIVE_UPDATE_DEBOUNCE_MS` controls how long ballot and lifecycle updates are coalesced before
being delivered to live queries. It defaults to `500` milliseconds and is validated at startup.

## Backups and recovery

Votum does not create or retain PostgreSQL backups. Choose a backup and recovery plan that fits your database provider and deployment.

If you run PostgreSQL yourself, store backups separately from the database host and test restoring them into a throwaway database. If you use a managed provider, review its backup, retention, and restore procedures and test the recovery path you depend on.

## Migration recovery

If a deployment fails while applying migrations, inspect the application logs first. Fix the database or configuration problem before retrying the deployment.

If you need to run the migrator manually, run it from the application image with the normal production environment:

```sh
node scripts/server/migrate.mjs
```

Do not use `db:push` in production. It changes the database to match the current schema definition instead of applying the committed migration history for the image.

## Appendix: environment variables

The deployment variables are listed first. The remaining variables are used only by one-time setup or local demo scripts.

| Variable                 | Used by                | When to set it        | Purpose                                                                                         |
| ------------------------ | ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | App and server scripts | Always                | PostgreSQL connection URL.                                                                      |
| `ORIGIN`                 | App                    | Always                | Public application URL, including `https://`.                                                   |
| `BETTER_AUTH_SECRET`     | App                    | Always                | Secret used by Better Auth. Use at least 32 high-entropy characters.                            |
| `SETUP_USER_EMAIL`       | `setup-user.mjs`       | First deployment only | Email address for the first Organizer.                                                          |
| `SETUP_USER_PASSWORD`    | `setup-user.mjs`       | First deployment only | Password for the first Organizer. It must contain at least 12 characters.                       |
| `SETUP_USER_NAME`        | `setup-user.mjs`       | First deployment only | Name for the first Organizer.                                                                   |
| `SEED_ORGANIZER_EMAIL`   | `db:seed`              | Local demo setup      | Email address of the Organizer who owns the demo Meeting.                                       |
| `SEED_ORGANIZER_USER_ID` | `db:seed`              | Local demo setup      | User ID of the Organizer who owns the demo Meeting. Use this instead of `SEED_ORGANIZER_EMAIL`. |

The Dockerfile also sets `NODE_ENV`, `HOST`, `PORT`, `PROTOCOL_HEADER`, and `HOST_HEADER` in the production image. You normally do not need to override them.
