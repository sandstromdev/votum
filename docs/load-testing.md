# Load testing

The repository contains a browser-based load test for a dedicated hosted test Meeting. It uses the same participant page and ballot forms as a real browser, so each participant gets its own Meeting-scoped participant-token cookie and live update connection.

Do not point this at a live Meeting. Create a dedicated test Meeting with one active Vote and run the test during a quiet window. The test writes Ballots and leaves the Meeting data behind for verification and cleanup.

## Run a dry run

```sh
bun run load-test -- \
  --dry-run \
  --base-url https://votum.example \
  --meeting-locator ar4m7x2q \
  --users 100
```

## Run the test

```sh
bun run load-test -- \
  --base-url https://votum.example \
  --meeting-locator ar4m7x2q \
  --users 50 \
  --ramp-ms 30000 \
  --hold-ms 60000 \
  --allow-writes
```

The command starts one Presentation client, ramps participant browser contexts, submits their Ballots concurrently, keeps their live connections open, then staggers reads, replacements, and withdrawals during the hold period. It prints a JSON summary and writes a complete JSON report containing operation counts, success/failure counts, p50/p95/p99 timings, every sample, and failure details.

By default the report is written to a timestamped `load-test-report-*.json` file in the current directory. Choose a fixed path with `--report-file reports/meeting-load.json` or `LOAD_TEST_REPORT_FILE`.

The same values can be provided through `LOAD_TEST_*` environment variables. Run `bun run load-test -- --help` for the complete list.

The first run should be small, for example 10 participants. Increase the count only after checking application logs, host CPU and memory, PostgreSQL connections and lock waits, and the final Ballot count. The app's `/api/health` endpoint only checks a database `SELECT 1`; it is not a capacity signal.
