# Arka, Phase 3 Deployment Documentation

**Team True Node** | Duothan 6.0 | 6 August 2026
Repository: https://github.com/agentdynarq/arka

---

## 1. What we deployed

Arka is a **cell-isolated digital banking platform**. Customers are split across
independent Cells. Each Cell is a complete bank: its own database, its own keys,
its own network. Cells share nothing and there is no route between them, so a
compromise of one reaches nothing else.

Deployed to **AWS `ap-south-1`** as three hosts, each in its **own VPC**, with no
peering connection and no transit gateway.

| Host | VPC | Instance | Runs |
|---|---|---|---|
| `arka-control` | 10.10.0.0/16 | t3.small | Recovery Console, control plane API, Gateway, control database |
| `arka-cell-1` | 10.1.0.0/16 | t3.small | Customer app, identity API, Postgres, Redis |
| `arka-cell-2` | 10.2.0.0/16 | t3.small | The same image with a different `CELL_ID`, its own database and keys |

## 2. Live URLs

| Surface | URL |
|---|---|
| Customer app, Cell 1 | https://cell-1.13.203.248.243.nip.io |
| Customer app, Cell 2 | https://cell-2.13.234.216.65.nip.io |
| Recovery Console | https://arka.13.127.6.146.nip.io |
| Control plane API | https://arka-api.13.127.6.146.nip.io |
| Gateway | https://arka-gw.13.127.6.146.nip.io |

TLS is a real Let's Encrypt certificate on every surface, issued by Caddy.
`nip.io` provides the hostname without owning a domain.

**Sign in.** MFA is real and required; only the password is published so a judge
can use it.

| Cell | Username | Password | Pay to |
|---|---|---|---|
| Cell 1 | `alice` | `demo-password-123` | `customer:bob` |
| Cell 2 | `chandi` | `demo-password-123` | `customer:deepal` |

Press "Check your phone for the code" at the MFA step.

> A customer can only pay someone in their own Cell. Cross-Cell settlement is
> designed but not built, and was recorded as an accepted cost in `docs/adr/0001`
> before any code was written. Design in `docs/CROSS-CELL-SETTLEMENT.md`.

## 3. Infrastructure as code

All infrastructure is **AWS CDK in TypeScript**, in `infra/cdk/`, with tests.

```
infra/cdk/
  bin/arka-infra.ts            entry point, config from cdk.json
  lib/stacks/arka-stack.ts     one control plane, one Cell per config entry
  lib/constructs/cell.ts       a Cell: VPC, subnet, IGW, SG, EIP, host
  lib/constructs/control-plane.ts
  lib/constructs/github-oidc.ts
  lib/user-data/               cloud-init per role
  test/arka-stack.test.ts
```

**Adding a Cell is one config entry, not code.** `cdk.json` holds a `cells` map
and the stack instantiates the same construct once per entry. No service source
file branches on which Cell it is.

Hosts are hardened by cloud-init: Docker, UFW, IMDSv2 required, password and
root SSH login disabled.

## 4. Release automation

`.github/workflows/deploy.yml` runs four stages on every push to `main`:

**verify** typecheck, unit tests, a 100% branch coverage gate on the ledger core,
and a dependency audit.
**build** one image per role from that commit, tagged with the commit SHA, built
on a runner and pushed to Amazon ECR.
**release** each host pulls that exact image over AWS Systems Manager. Cells
first, control plane last.
**smoke** every public surface, TLS trust, and that no database port is exposed.

Two properties worth naming. **An image is built once and every host runs that
artefact**, so what reaches production is what the tests ran against, and nothing
compiles on a target host. **Rollback is the same workflow with an older SHA**,
no rebuild.

Hosts are reached over Systems Manager, so a release needs no inbound SSH port
and no private key.

Capacity has its own workflow. `.github/workflows/add-cell.yml` takes a Cell id
and a CIDR and provisions the VPC and host, generates that Cell's own credentials
into SSM Parameter Store, builds and releases its image, registers it with the
control plane, confirms it is serving, and commits the config change. About four
minutes, no human touching a server.

## 5. Operational visibility

| Layer | Answers | Where |
|---|---|---|
| Synthetic | Can a customer reach their Cell? | `uptime.yml`, every 10 minutes from outside our VPCs, opens a GitHub issue on failure |
| Application | Is each Cell healthy, is its ledger intact? | Recovery Console, screens W5 and W6 |
| Container | Is each service up? | Health checks on every service, `restart: unless-stopped` |
| Logs | What did it say? | CloudWatch, one log group per Cell plus one for the control plane |
| Evidence | Who did what, and can we prove it? | Append-only, hash-chained operator audit trail |

Log groups mirror the architecture: reading one Cell's logs never means reading
another's.

## 6. Verification, reproducible by a judge

**Public surfaces and exposure**

```bash
deploy/verify/smoke.sh 13.127.6.146 13.203.248.243 13.234.216.65
```

**Cell isolation**, captured from the running hosts:

```
From the control host to Cell 1's data layer (permitted by a /32 rule):
  nc: connect to 13.203.248.243 port 5432 failed: Connection refused
  nc: connect to 13.203.248.243 port 6379 failed: Connection refused

From the Cell 1 host to Cell 2's database (Cell 1 is not the control plane):
  timeout 8 nc -vz 13.234.216.65 5432  ->  exit=124, timed out
```

**Refused versus dropped is the proof.** From the control plane the packet
reaches the host and finds no listener. From another Cell it never arrives at
all, because the security group admits only the control plane's address.

```bash
aws ec2 describe-vpc-peering-connections --region ap-south-1
{ "VpcPeeringConnections": [] }
```

**Ledger integrity**

```bash
pnpm verify-ledger --cell cell-1
```

Walks the hash chain, recomputes every block, and reports a clean root hash or
the exact sequence number of the first break.

**Containment under load**

```bash
deploy/verify/load.sh <cell-host> <control-host> 60 30
```

Saturates one Cell while sampling another every second. The result is whether
anything else moved, not a throughput figure.

## 7. Screenshots

*(insert here)*

| # | Shows |
|---|---|
| 01 | Recovery Console, both Cells healthy |
| 02 | Customer signed in on Cell 1 |
| 03 | A different customer on Cell 2, different data |
| 04 | A completed transfer |
| 05 | Cell 1's customer rejected by Cell 2's registry |
| 06 | **Containment: Cell 1 quarantined and read-only while Cell 2 transacts normally** |
| 07 | Ledger integrity audit, clean chain and root hash |
| 08 | Operator audit trail |
| 09 | CI green on `main` |
| 10 | Three separate VPCs, zero peering connections |

## 8. What is not built, and why

Stated here rather than left to be discovered.

| | |
|---|---|
| Cross-Cell transfers | Designed, not built. Recorded as an accepted cost in ADR 0001 before any code was written |
| Anomaly detection | Deferred since Phase 1. Rate limiting and account lockout exist. Quarantine is deliberately a two-operator decision, because automatic quarantine is a denial of service an attacker can trigger by making noise |
| Autoscaling on load | Deliberately not built. Automatic capacity changes would mean reassigning customers between Cells, turning blast radius into something discovered at runtime rather than chosen. Adding a Cell is fully automated; deciding to is not |
| Managed data tier | Postgres and Redis run in containers, not RDS and ElastiCache, because rebuilding a Cell live takes under four minutes this way and RDS provisioning alone is fifteen |
| Operator authentication | The Console has no login of its own. Mitigated with basic auth at the edge. Real RBAC exists in `@arka/identity` and wiring it in is unfinished |
| Ledger hash keying | Unkeyed SHA-256. Detects tampering by anyone who cannot rewrite the whole chain, and names the exact block. An attacker with full database write access can rewrite it consistently. Keying the hash with a secret held outside the Cell closes this |
| Measured capacity | Nothing has been load tested at production scale. We do not quote figures we have not measured |

## 9. Further reading in the repository

| Document | |
|---|---|
| `docs/PHASE-3-ARCHITECTURE.md` | The AWS architecture and what it substitutes |
| `docs/DEPLOYMENT.md` | Full deployment detail |
| `docs/RUNBOOK.md` | Operator procedures P1 to P5 |
| `docs/OBSERVABILITY.md` | What is watched and what an operator does at 3am |
| `docs/SCALING.md` | The scaling model and why it is not metric-triggered |
| `docs/CROSS-CELL-SETTLEMENT.md` | Designed mechanism for money between Cells |
| `docs/adr/` | Every irreversible decision with the alternative rejected |
