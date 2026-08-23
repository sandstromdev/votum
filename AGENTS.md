# AGENTS.md

## Tooling

**Bun** is the preferred package manager and script runner.

**Edit loop:** IDE diagnostics, targeted `test:unit` on touched files, and Svelte MCP / `svelte-code-writer` for `.svelte` work.

**Handoff:** `bun run lint`, `bun run check`, and `bun run test:unit -- --project server` once the change set is ready. Playwright (`--project client`, `test:e2e`) is the human gate. The sandbox hides CPU info, so Chromium often fails to launch.

## Language

- **UI**: Swedish (sv-SE).
- **Code / AI**: English.
- **Vote** / **Ballot** (not Poll / response); glossary → `CONTEXT.md`.

## Architecture

SvelteKit remotes, Better Auth, Drizzle/PostgreSQL.

- **`$lib/remotes/*.remote.ts`** — data/API (`query`, `form`, `command`). Export remotes and types only; values live in `$lib/<domain>/`.
- **`$lib/schemas/`** — Zod schemas for forms and remote args.
- **`$lib/server/`** — DB, auth, schema; UI reaches it through remotes.
- **`$lib/components/ui/`** — shadcn-svelte primitives.
- **`$lib/components/<domain>/`** — domain UI.
- **`$lib/<domain>/`** — domain client state and helpers.

Comment complex DB and server actions: why a transaction exists, what it races, what a remote mutates.

## Naming

- kebab-case for files, folders, and routes. Split an app file around 350 lines when a second responsibility appears.
- Domain code in a singular folder (`$lib/vote/`). One file: `index.ts`. Several: deep imports, no barrels; filenames drop the domain prefix (`results.ts`). Related files go in a subfolder, not `<domain>-<concern>.ts` siblings.
- Cross-cutting helpers only at `$lib/` root; search `$lib/` before adding one.

## Svelte and TypeScript

- `$derived`, event handlers, props/callbacks over `$effect`.
- Event-handler props: camelCase (`onSubmit`).
- Inferred return types unless an annotation is a public API boundary.
- Precise type, or `unknown` then narrow.
- TypeScript imports use a `.js` specifier (`./create-db.js`, `#lib/server/db/index.js`).
- Svelte (`.svelte`, `.svelte.ts`) → Svelte MCP / `svelte-code-writer`.

## UI

- Tailwind utilities; scoped CSS when Tailwind cannot express the requirement.
- Compose domain UI from `$lib/components/ui` (shadcn-svelte).
- Forms use Field.* components.

## Database

- Schema changes: `db:generate` then `db:migrate`; `db:push` is human-only.
- Short transactions; no network I/O inside.
- Drop data only with explicit user consent.

## Pointers

Domain, architecture, or exploration → `docs/agents/domain.md`

Issues (publish, fetch, wayfinder map/children) → `docs/agents/issue-tracker.md`

Triage labels → `docs/agents/triage-labels.md`
