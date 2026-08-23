# Domain docs

What to read before exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root
- ADRs under `docs/adr/` that touch the area you are about to work in

If a file is missing, proceed. `/domain-modeling` (via `/grill-with-docs` and `/improve-codebase-architecture`) creates these when terms or decisions get resolved.

## Use the glossary's vocabulary

When output names a domain concept (issue title, refactor, hypothesis, test name), use the term as defined in `CONTEXT.md`. Stick to the glossary's chosen word over the synonyms it avoids.

If the concept is not in the glossary, either you invented language the project does not use, or there is a real gap for `/domain-modeling`.

## Flag ADR conflicts

If you contradict an existing ADR, say so instead of silently overriding:

> Contradicts ADR-0001 (private ballot readback), but worth reopening because…
