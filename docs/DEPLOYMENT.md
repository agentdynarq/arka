# Deployment

Phase 3 submission deliverable 03. What is running, where, how it got there, and
how to verify it independently.

Architecture and the reasoning behind it are in
[PHASE-3-ARCHITECTURE.md](PHASE-3-ARCHITECTURE.md). Operator procedures are in
[RUNBOOK.md](RUNBOOK.md). This document is the deployment itself.

---

## 1. What is deployed

Region `ap-south-1` (Mumbai). Three hosts, each in its **own VPC**, with no
peering connection and no transit gateway between them.

| Host | VPC | Type | Runs | Public entry point |
|---|---|---|---|---|
| `arka-control` | 10.10.0.0/16 | t3.small | Recovery Console, control plane API, Gateway, control Postgres | `https://arka.13.127.6.146.nip.io` |
| `arka-cell-1` | 10.1.0.0/16 | t3.small | Customer app, identity API, Postgres, Redis | `https://cell-1.13.203.248.243.nip.io` |
| `arka-cell-2` | 10.2.0.0/16 | t3.small | Same image, different `CELL_ID`, own database and keys | `https://cell-2.13.234.216.65.nip.io` |

**Live URLs**

| Surface | URL |
|---|---|
| Customer app, Cell 1 | https://cell-1.13.203.248.243.nip.io |
| Customer app, Cell 2 | https://cell-2.13.234.216.65.nip.io |
| Recovery Console | https://arka.13.127.6.146.nip.io |
| Control plane API | https://arka-api.13.127.6.146.nip.io |
| Gateway | https://arka-gw.13.127.6.146.nip.io |

`nip.io` resolves `anything.1.2.3.4.nip.io` to `1.2.3.4`, which lets Caddy obtain
real Let's Encrypt certificates without owning a domain. Public CA, valid TLS,
no DNS to configure.

**Demo credentials.** Published deliberately so a judge can sign in. MFA is real
and still required; only the password is public.

| Cell | Username | Password | Pay to |
|---|---|---|---|
| Cell 1 | `alice` | `demo-password-123` | `customer:bob` |
| Cell 2 | `chandi` | `demo-password-123` | `customer:deepal` |

The Recovery Console is behind HTTP basic auth at the edge, because the console
has no operator login of its own. Credentials are shared with the panel
separately and are not in this repository.

---

## 2. Infrastructure as code

Everything above is defined in `infra/cdk/`, AWS CDK in TypeScript, with tests.

```
infra/cdk/
├── bin/arka-infra.ts              entry point, reads config from cdk.json
├── lib/stacks/arka-stack.ts       one control plane, one Cell per config entry
├── lib/constructs/cell.ts         a Cell: VPC, subnet, IGW, SG, EIP, host
├── lib/constructs/control-plane.ts
├── lib/user-data/                 cloud-init for each role
├── cdk.json                       the only place a Cell is declared
└── test/arka-stack.test.ts
```

**Adding a Cell is a config entry, not code.** `cdk.json` holds a `cells` map;
the stack instantiates the same construct once per entry. No service source file
branches on which Cell it is, and that is enforced rather than merely intended.

Deploy manually with:

```bash
cd infra/cdk
npx cdk deploy --require-approval never
```

---

## 3. How a release reaches production

`.github/workflows/deploy.yml`. The shape is the argument.

```
push to main
   │
   ├─ verify    typecheck, unit tests, ledger-core coverage gate, dependency audit
   │
   ├─ build     one image per role, from that commit, tagged with the commit SHA
   │            built on a GitHub runner, pushed to ECR
   │
   ├─ release   Cells first, control plane last, over AWS Systems Manager
   │            each host pulls the SHA-tagged image and restarts
   │
   └─ smoke     public surfaces, TLS trust, and that no database port is exposed
```

Four properties worth stating plainly:

**Built once, run everywhere.** An image is built from a commit exactly once and
every host runs that artefact. What reaches production is what the tests ran
against, not a rebuild of it.

**Nothing compiles on a target host.** Cell hosts are 2 GiB. Building there would
be fragile even if it fit.

**Hosts are reached over Systems Manager**, so a release needs neither an
inbound SSH port nor a private key anywhere.

**Credentials, and an honest note.** The pipeline is built for OIDC: GitHub
exchanges a short-lived token for an IAM role, so no long-lived key exists. The
role, the identity provider, and both trust conditions were deployed and verified
correct against the account:

```
Federated  arn:aws:iam::785013739418:oidc-provider/token.actions.githubusercontent.com
aud        StringEquals  sts.amazonaws.com
sub        StringLike    repo:agentdynarq/arka:*
```

Every token was still refused with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`, and we ran out of competition window to find
why. The workflow therefore falls back to an access key pair when the OIDC role
is unset, and it still attempts OIDC first.

This is a real downgrade and it is written down rather than swapped quietly: a
key is long-lived where a token lasts an hour. Restoring the intended path is
deleting two secrets once the cause is found. Nothing else in the pipeline
changes, because authentication is one step and the build, release and
verification stages never knew the difference.

**Rollback is the same workflow with an older SHA.** No rebuild, no improvisation
during an incident.

Adding capacity has its own workflow, `.github/workflows/add-cell.yml`: one
dispatch provisions an isolated VPC and host, generates that Cell's own
credentials into SSM Parameter Store, builds and releases its image, registers it
with the control plane, confirms it is serving, and commits the config change
that caused it. See [SCALING.md](SCALING.md).

---

## 4. Deploying by hand

The pipeline is the normal route. This is the procedure it automates, and the
fallback if GitHub is unavailable.

```bash
# On each host, once
git clone -b phase3/deploy <repo> /opt/arka && cd /opt/arka
cp deploy/cell/.env.example deploy/cell/.env     # or deploy/control/
# fill in the secrets, generate them rather than typing them:
openssl rand -hex 32

# Then
deploy/build.sh cell                              # adds swap first on small hosts
docker compose -f deploy/cell/docker-compose.yml --env-file deploy/cell/.env up -d
```

Full step by step, including the order of hosts and why the control plane is
configured last, is in [../deploy/README.md](../deploy/README.md).

---

## 5. Verification

Everything below is reproducible by a judge with the repository and the URLs.

### Public surfaces

```bash
deploy/verify/smoke.sh <control-ip> <cell-1-ip> <cell-2-ip>
```

Checks every public surface, that TLS is trusted, and that **no database port is
reachable from the internet**.

### Cell isolation

```bash
# run on the Cell 1 host, pointed at Cell 2
deploy/verify/isolation-evidence.sh <cell-2-ip> cell-2-api.<cell-2-ip>.nip.io
```

Writes a timestamped transcript of three checks, and states what each one does
**not** prove:

1. **Data layer.** Cell 1 cannot connect to Cell 2's database.
2. **Credential layer.** Cell 1's environment holds no Cell 2 credential, key or
   database URL.
3. **Application layer.** Cell 2 answers Cell 1 exactly as it answers a stranger,
   with 401. An address is not access.

Reaching another Cell's public web port is not a failure. Every machine on the
internet can do that. The claim is that a compromise of one Cell yields no
credential, key or network position that reaches another's data.

```bash
aws ec2 describe-vpc-peering-connections --region ap-south-1
# expected: an empty list
```

### Ledger integrity

```bash
docker compose -f deploy/control/docker-compose.yml exec recovery pnpm verify-ledger --cell cell-1
```

Walks the hash chain, recomputes every block, and reports a clean root hash or
the exact sequence number of the first break. Screen W6 does the same in a
browser and exports the evidence.

### Containment under load

```bash
deploy/verify/load.sh <cell-1-host> <control-host> 60 30
```

Saturates one Cell while sampling another surface every second. The throughput
figure is not a capacity claim on 2 GiB hosts and is not presented as one. The
result is whether anything else moved.

### Continuous

`.github/workflows/uptime.yml` runs the smoke test every 10 minutes from outside
our VPCs and opens a GitHub issue on failure. See
[OBSERVABILITY.md](OBSERVABILITY.md).

---

## 6. Screenshots

Files live in `docs/media/phase3/`.

| # | File | What it shows |
|---|---|---|
| 01 | `01-health-map.png` | Recovery Console W5, all Cells green |
| 02 | `02-customer-cell-1.png` | Alice signed in on Cell 1, real balance |
| 03 | `03-customer-cell-2.png` | Chandi signed in on Cell 2, different Cell, different data |
| 04 | `04-transfer.png` | A completed transfer, W3 |
| 05 | `05-quarantine-dual-approval.png` | Quarantine pending a second operator |
| 06 | `06-containment.png` | Cell 1 read-only and Cell 2 transacting, side by side |
| 07 | `07-integrity-audit.png` | W6, clean chain and root hash |
| 08 | `08-pipeline.png` | A green run of `deploy`, all four jobs |
| 09 | `09-aws-vpcs.png` | Three separate VPCs, and zero peering connections |
| 10 | `10-cloudwatch-logs.png` | Log groups `/arka/cell-1`, `/arka/cell-2`, `/arka/control` |
| 11 | `11-isolation-evidence.png` | Terminal output of the three isolation checks |
| 12 | `12-add-cell.png` | `add-cell` workflow adding Cell 3, and the health map picking it up |

Capture 06 and 09 above all. The first is the architecture doing the thing it
claims, and the second is the claim itself, in the AWS console, unedited.

---

## 7. Honest status

Stated here rather than discovered during evaluation.

| | |
|---|---|
| Cross-Cell transfers | Not built. A payee must be in the same Cell. Designed in [CROSS-CELL-SETTLEMENT.md](CROSS-CELL-SETTLEMENT.md), recorded as an accepted cost in `adr/0001` before any code was written |
| Anomaly detection | Deferred since Phase 1. Rate limiting and account lockout exist. Quarantine is deliberately a human decision needing two operators, because automatic quarantine is a denial of service an attacker can trigger |
| Autoscaling on load | Deliberately not built. Automatic capacity changes would mean reassigning customers between Cells, turning blast radius into something discovered at runtime rather than chosen. Adding a Cell is fully automated; deciding to is not. See [SCALING.md](SCALING.md) |
| Managed data tier | Postgres and Redis run in containers, not RDS and ElastiCache. Runbook P3 rebuilds a Cell live in under four minutes; RDS provisioning alone is fifteen |
| Operator authentication on the console | The console has no login of its own; `operatorId` is free text. Mitigated with basic auth at the edge. Real RBAC exists in `@arka/identity` and wiring it in is unfinished, not hidden |
| Hash chain keying | Unkeyed SHA-256. Detects any tampering by an actor who cannot rewrite the whole chain, and names the exact block. An attacker with full database write access can rewrite it consistently. Closing that needs the hash keyed with a secret held outside the Cell |
| Verified capacity figures | Nothing has been load tested against a production-sized deployment. We do not quote numbers we have not measured |

## 8. Where to look next

| Document | |
|---|---|
| [PHASE-3-ARCHITECTURE.md](PHASE-3-ARCHITECTURE.md) | The AWS architecture, and what Tier 0 substitutes and why |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The platform, and the blueprint-versus-built divergence table |
| [RUNBOOK.md](RUNBOOK.md) | P1 to P5, the procedures performed during the demonstration |
| [OBSERVABILITY.md](OBSERVABILITY.md) | What is watched, at which layer, and what an operator does at 3am |
| [SCALING.md](SCALING.md) | The scaling model and why it is not metric-triggered |
| [CROSS-CELL-SETTLEMENT.md](CROSS-CELL-SETTLEMENT.md) | The designed mechanism for money between Cells |
| [adr/](adr/) | Every irreversible decision, with the alternative that was rejected |
