# Deploying Arka to AWS

The procedure, in order, for the three hosts described in
`docs/PHASE-3-ARCHITECTURE.md` section 3. Terraform creates the hosts. This
document puts Arka on them.

Nothing here pushes to GitHub. The Phase 2 repository is frozen for judging and
the source reaches each host over SSH.

## 0. Before starting

Terraform has been applied and you have three public addresses and three
private ones. Cell hosts first, control plane last, because the control plane's
`.env` needs the Cells' private addresses.

## 1. Copy the source to each host

From your laptop, in the repository root. `node_modules` is excluded because
the install happens inside the image, on Linux.

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist \
  --exclude .git --exclude '*.tfstate*' --exclude .terraform \
  ./ ubuntu@<host-ip>:/opt/arka/
```

## 2. Each Cell host

```bash
ssh ubuntu@<cell-ip>
cd /opt/arka
cp deploy/cell/.env.example deploy/cell/.env
```

Fill in `deploy/cell/.env`. Every secret differs from the other Cell's. Generate
them rather than typing them:

```bash
openssl rand -hex 32
```

`PRIVATE_IP` is the host's VPC address, from `ip -4 addr show ens5`. Postgres and
Redis bind there rather than to `0.0.0.0`, so they never appear on the public
interface.

```bash
deploy/build.sh cell
docker compose -f deploy/cell/docker-compose.yml --env-file deploy/cell/.env up -d
docker compose -f deploy/cell/docker-compose.yml ps
```

All five containers healthy before moving on. Caddy needs a minute to obtain
its certificate. If it fails repeatedly, check that the security group actually
permits inbound 80, which Let's Encrypt requires for the HTTP challenge.

Repeat for the second Cell with its own `.env`. **The only thing that differs is
the `.env` file.** If you find yourself editing a compose file for the second
Cell, stop: something has become Cell-specific that should not be.

## 3. The control plane host

```bash
ssh ubuntu@<control-ip>
cd /opt/arka
cp deploy/control/.env.example deploy/control/.env
```

Fill in the `CELL1_*` and `CELL2_*` blocks with each Cell's **private** address
and the secrets you generated in step 2. This is the only file in the whole
deployment that names more than one Cell.

```bash
deploy/build.sh control
docker compose -f deploy/control/docker-compose.yml --env-file deploy/control/.env up -d
```

## 4. Seed and verify

Both run from the control plane, because it is the only host that holds
credentials for every Cell. That is not a convenience, it is the architecture
demonstrating itself.

```bash
docker compose -f deploy/control/docker-compose.yml exec recovery pnpm seed
docker compose -f deploy/control/docker-compose.yml exec recovery pnpm verify-ledger --cell cell-1
docker compose -f deploy/control/docker-compose.yml exec recovery pnpm verify-ledger --cell cell-2
```

`verify-ledger` is runbook P1 performed against the real deployment. Its output
is evidence. Capture it.

## 5. Smoke test before you sleep

| Check | Expected |
|---|---|
| `https://cell-1.<ip>.nip.io` | Customer app, sign in as `alice` |
| `https://cell-2.<ip>.nip.io` | Customer app, sign in as `chandi` |
| `https://arka.<ip>.nip.io` | Recovery Console, health map shows both Cells green |
| A transfer in Cell 1 | Completes, and appears in the ledger |
| Quarantine Cell 1 from the console, with two operator ids | Cell 1 read-only, Cell 2 unaffected in its own tab |

The last row is runbook P2 and it is the demonstration the whole day is built
around. Run it end to end at least twice tonight.

## 6. Capture the isolation evidence

Three commands, run from the Cell 1 host, output saved. Section 5 of the
architecture document explains what each one proves and, just as importantly,
what it does not.

```bash
# 1. Data layer. No route into Cell 2's VPC.
nc -vz <cell-2-private-ip> 5432

# 2. Credential layer. Nothing belonging to Cell 2 exists here.
docker compose -f deploy/cell/docker-compose.yml exec identity env | grep -i cell

# 3. Application layer. An address is not access.
curl -s -o /dev/null -w '%{http_code}\n' https://cell-2-api.<ip>.nip.io/v1/me/dashboard
```

Expected: connection refused or timeout, no `cell-2` values, and `401`.

## Teardown

Do not run `terraform destroy` before the results are announced.
