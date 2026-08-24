# votum

votum runs Meetings. An Organizer opens a Meeting, puts Votes on the agenda, and shows them to the room. Participants join through a Meeting link, with no account. Each browser can hold one current Ballot per Vote. A Presentation view shows the current Meeting to the room without Organizer controls or anyone's Ballot.

A Vote is either a decision (should this pass?) or a candidate-style selection (who or what fills a position).

The UI is Swedish. There are no plans to add other languages.

This is an early v1 for running Meetings, not a general voting platform.

## Security, v1

A Meeting link is the access control for participants. Anyone who has it can cast a Ballot. Each browser gets one opaque token per Meeting. That token enforces one current Ballot. It is not a login and not proof of who voted. Lose the token, lose the Ballot. Presentation shows the room the Meeting, not anyone's Ballot. Organizer accounts exist only through `setup:user`. There is no signup.

Treat this as a room tool, not a secret ballot or an identified election. Later versions can tighten this. File a public issue if the code fails that model. See [`SECURITY.md`](SECURITY.md).

SvelteKit, PostgreSQL, Better Auth.

## Requirements

- Node 24.16 or newer
- bun
- Docker, for local PostgreSQL 18

## Local setup

Copy `.env.example` to `.env`. Set `ORIGIN` to `http://localhost:5173` and give `BETTER_AUTH_SECRET` at least 32 random characters. Fill `SETUP_USER_EMAIL`, `SETUP_USER_PASSWORD` (12 characters or more), and `SETUP_USER_NAME` for the first Organizer.

```sh
bun install
docker compose up -d
bun run db:migrate
bun run setup:user
```

The app does not offer signup. `setup:user` inserts the Organizer into the database.

To add a demo Meeting for that Organizer, set `SEED_ORGANIZER_EMAIL` to the same address as `SETUP_USER_EMAIL` (or set `SEED_ORGANIZER_USER_ID`) and run:

```sh
bun run db:seed
```

Seeding is limited to `localhost`, `127.0.0.1`, and `::1` by default. To deliberately seed a remote database, pass `--allow-remote`:

```sh
bun run db:seed -- --allow-remote
```

## Deployment

For production, follow [`docs/deployment.md`](docs/deployment.md).

## Develop

```sh
bun run dev
```

## Tests

```sh
bun run test:unit
```

## See also

- [`CONTEXT.md`](CONTEXT.md) for domain terms
- [`AGENTS.md`](AGENTS.md) for how to work in this repo
- [`docs/deployment.md`](docs/deployment.md) for self-hosting

Copyright (c) 2026 Leo Sandström. MIT. See [`LICENSE`](LICENSE).
