Real terminal recordings, not staged screenshots. Every `.gif` here has a matching `.cast`
(asciicast v2, plain JSON lines) that is the literal raw output the command actually printed when
it was recorded, and a `scripts/*.mjs` that generated it. Re-run one with:

```bash
node record.mjs scripts/isolation.mjs isolation.cast
agg isolation.cast isolation.gif
```

`record.mjs` doesn't use `asciinema rec`: that recorder needs a Unix pty this Windows Python doesn't
have. Instead it runs each real command (or `fetch()` call) as a child process, captures the real
stdout, and writes it to asciicast format with real elapsed timing. `agg` (https://github.com/asciinema/agg)
renders the `.cast` to a `.gif`, no browser involved.

- `incident.gif` — the 2065 scenario's root cause, typed as a title card. Not a technical demo: there
  is no old system to run, so this doesn't pretend to hack one. Same framing already in README.md.
- `isolation.gif` — `docker compose ps`, then a real `docker exec ... ping` from Cell 1's container to
  Cell 2's, which fails on DNS resolution because the two Cells have no shared network, then
  `pnpm verify-ledger` walking both Cells' real hash chains.
- `quarantine.gif` — FR-22 end to end, live, against the real running stack: a real transfer succeeds,
  two operators quarantine Cell 1 under dual approval, the identical transfer is now rejected
  `403 CELL_QUARANTINED`, a read still succeeds (read-only, not down), operators lift the quarantine
  under dual approval again, and the transfer succeeds again.

`get-alice-token.mjs` is what `quarantine.mjs` uses to sign in as the demo customer without racing the
30-second TOTP window a human typing curl commands would hit: it reads alice's `mfaSecret` straight
from Postgres and computes the current code, same trick used earlier in this session's manual
verification. Run it from `apps/identity/` (needs `@arka/identity` to resolve) before re-recording
`quarantine.mjs`.
