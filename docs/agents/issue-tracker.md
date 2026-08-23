# Issue tracker

Issues and specs live as GitHub issues. Use `gh`. Run it from the clone; it picks the repo from the git remote.

## Publish

When a skill says "publish to the issue tracker", create a GitHub issue. Done when `gh issue view <number>` shows the new issue.

```sh
gh issue create --title "..." --body "$(cat <<'EOF'
...
EOF
)"
```

## Fetch

When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`. Done when you have the body, labels, and comments.

## Triage config

**PRs as a request surface: no.**

A bare `#42` may be an issue or a PR. Try `gh pr view 42`, then `gh issue view 42`.

## Wayfinding

Used by `/wayfinder`. The map is one issue. Child issues are the tickets.

**Map.** Create with `gh issue create --label wayfinder:map`. Body has Notes, Decisions-so-far, and Fog. Done when that labelled issue exists with those headings.

**Child ticket.** Create with `gh issue create --parent <map> --label wayfinder:<type>`, where type is `research`, `prototype`, `grilling`, or `task`. If `--parent` fails, add the child to a task list in the map body and put `Part of #<map>` at the top of the child. Done when the child is linked to the map and labelled.

**Blocking.** `gh issue create --blocked-by <n>` or `gh issue edit <n> --add-blocked-by <n>`. A ticket is unblocked when `gh issue view <n> --json blockedBy` shows no open blockers. If dependencies are unavailable, put `Blocked by: #<n>, #<n>` at the top of the child body and treat a ticket as unblocked when every listed issue is closed.

**Frontier.** List the map's open children from `gh issue view <map>` (sub-issues JSON, or the map's task list). Drop any with an open blocker or an assignee. First remaining in map order wins.

**Claim.** `gh issue edit <n> --add-assignee @me`. This is the session's first write. Done when you are the assignee.

**Resolve.** Comment the answer, close the issue, then append a context pointer (gist + link) to the map's Decisions-so-far. Done when the child is closed and the map cites it.
