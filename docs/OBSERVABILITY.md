# Observability

How an operator knows what the platform is doing, at each layer, and what is
deliberately not built.

The organising idea is that **a Cell's observability is as isolated as the Cell
is**. Logs, health and evidence are per Cell. Only the control plane sees across
them, and it is the only component that is supposed to.

## 1. The four layers

| Layer | Question it answers | Where |
|---|---|---|
| Synthetic | Can a customer reach their Cell right now? | `.github/workflows/uptime.yml`, every 10 minutes |
| Application | Is each Cell healthy, and is its ledger intact? | Recovery Console, screens W5 and W6 |
| Container | Is each service up, and what is it saying? | Docker healthchecks, logs to CloudWatch |
| Evidence | What happened, who did it, can it be proven? | Append-only audit trail and hash-chained ledger |

Most systems have the middle two. The first and the last are what make this
operable rather than merely monitored.

## 2. Synthetic, outside-in

`deploy/verify/smoke.sh` runs on a schedule from a GitHub runner, which is a
machine we do not own and which sits outside our VPCs. It checks every public
surface, that TLS is trusted, and **that no database port is reachable from the
internet**. A failure opens or comments on a GitHub issue labelled `uptime`, so
alerts land next to the work and keep their history. One open incident at a
time, so a flapping service does not bury the board.

This is the only check that can catch "the platform believes it is fine and
customers cannot reach it", which is the failure the Recovery Console cannot see
by construction, because it is asking the platform about itself.

## 3. Application, the Recovery Console

**W5, the health map.** Per-Cell status and observed latency. The control plane
reaches each Cell's Postgres and Redis directly, so a Cell that is up but whose
data layer is unreachable reports as impaired rather than healthy. Quarantine
state is shown here and changing it needs two operators.

**W6, the ledger integrity audit.** Walks a Cell's hash chain, recomputes every
block, and reports either a clean root hash or the exact sequence number of the
first break. Exportable as evidence.

`pnpm verify-ledger --cell <id>` does the same from a command line, which is
what to use when the console itself is the thing you suspect.

## 4. Container

Every service defines a `healthcheck`, so `docker compose ps` is a real answer
rather than a list of processes that exist. `restart: unless-stopped` means a
crashed service comes back without a human.

Logs ship to CloudWatch Logs via the `awslogs` driver, applied by
`deploy/{cell,control}/docker-compose.cloudwatch.yml` when
`ARKA_CLOUDWATCH_LOGS=true` is set on the host. Grouping matters and mirrors the
architecture:

| Log group | Contents |
|---|---|
| `/arka/cell-1` | Only Cell 1. Streams: postgres, redis, identity, web, caddy |
| `/arka/cell-2` | Only Cell 2 |
| `/arka/control` | Control plane only. Streams: postgres, recovery, gateway, console, caddy |

Reading one Cell's logs never means reading another's. An operator handed one
incident is not handed the whole bank.

The overlay is a separate file so the base compose still runs on a laptop with
no AWS account, which keeps "a stranger can start the whole platform with one
command" true.

## 5. Evidence

Every operator action is written to an append-only audit trail using the same
hash-chain primitive as the ledger. Quarantine requests and approvals record who
asked, who approved and why. This is the layer that answers "prove the recovery
was legitimate", and it is the reason the runbook says not to work around the
console to save time.

## 6. Release visibility

`.github/workflows/deploy.yml` tags every image with the commit SHA that built
it, so what is running on a host is traceable to a commit, a test run and a
person. The release finishes with an automated smoke test, so a green pipeline
means the public surface answered, not merely that containers started.

## 7. Not built, and why

Named rather than omitted, in the same spirit as the divergence table in
`docs/ARCHITECTURE.md`.

| Missing | Why |
|---|---|
| Host metrics: CPU, memory, disk | Needs the CloudWatch agent and an alarm set. Container healthchecks and the synthetic probe cover the failures that reach a customer; a saturated host shows up as failing healthchecks |
| Distributed tracing, correlation ids | Real value at multi-service scale. Within one Cell a request touches one deployable, so a trace would mostly restate the log line next to it |
| Metric-based alerting, error rate and latency SLOs | We alert on availability and on integrity, which are the two things that matter for a bank. Rate-based alerting needs a traffic baseline we do not have, because nothing has been load tested |
| Log retention and lifecycle policy | Groups are created on first write with default retention. A real deployment sets retention deliberately, per data classification |
| Anomaly detection | Declared deferred in the Phase 1 submission and still deferred. We have rate limiting. Detection that decides on its own to take a Cell read-only is exactly what we did not want to build in a week, because getting it wrong means attacking ourselves |

## 8. What an operator actually does at 3am

1. The `uptime` issue fires. Read which surface failed.
2. Open the Recovery Console health map. Is it one Cell or all of them?
3. One Cell: check that Cell's CloudWatch log group, then follow runbook P1 to
   confirm ledger integrity before touching anything.
4. All Cells: suspect the control plane or the network, not the Cells. Cells do
   not share a failure domain, so simultaneous failure is evidence about what
   they have in common, which is very little by design.
5. Any recovery action follows the runbook, through the console, so the audit
   trail records it.
