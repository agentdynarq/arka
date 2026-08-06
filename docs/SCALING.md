# Scaling, availability and reliability

What scales, what it costs, what is automated, and what is deliberately not.

## 1. The model in one sentence

**Arka scales by adding Cells, not by growing one.**

A Cell owns its own database and its customers are pinned to it by stable hash.
Growing a Cell under load would mean either a second instance sharing a second
database, or moving customers between Cells. Moving customers breaks the pinning
that the isolation guarantee rests on. So capacity is added by adding a
blast-radius boundary, never by widening an existing one.

That is not a workaround. It is the same decision as `docs/adr/0001`, applied to
capacity instead of to security.

## 2. Why we do not metric-trigger it

We deliberately do **not** autoscale Cells on CPU or request rate, and that is a
design decision rather than missing work.

Automatic capacity changes driven by load would mean the system reassigning
customers to Cells on its own. That would make blast radius a number discovered
at runtime rather than chosen in advance, which is the exact property the whole
architecture exists to provide. It would also hand an attacker a lever: generate
load, cause a reshuffle, and the containment boundaries move while you watch.

Adding a Cell is therefore a deliberate act. **What is automated is the doing of
it, not the deciding.**

## 3. What is automated

`.github/workflows/add-cell.yml`, dispatched with a Cell id and a CIDR, does all
of this without a human touching a server:

1. Validates that the id and CIDR do not collide with an existing Cell.
2. Generates that Cell's own database password, Redis password and signing key,
   and stores them in SSM Parameter Store as SecureStrings. Every Cell's
   credentials differ from every other Cell's, so Cell 1's password stays
   worthless against Cell 3.
3. Adds one entry to `infra/cdk/cdk.json` and deploys, creating a dedicated VPC,
   subnet, security group, Elastic IP and host. No peering to anything.
4. Builds that Cell's image and pushes it to ECR, tagged with the commit.
5. Writes the host's environment from Parameter Store and releases the
   application over SSM.
6. Registers the Cell with the control plane, the only component that is ever
   told more than one Cell exists.
7. Confirms the customer app answers and the Cell appears on the health map.
8. Commits the config entry that caused all of it.

**The only source change involved is one config entry.** No service code
branches on which Cell it is, and a test enforces that.

Roughly four minutes from dispatch to a Cell serving customers.

## 4. Availability

| Mechanism | What it covers |
|---|---|
| `restart: unless-stopped` on every container | A crashed service returns without a human |
| Health checks on every service | A container that is up but not working is visible, and dependents wait for it |
| Quarantine, dual approval | A compromised or misbehaving Cell degrades to read-only rather than going dark. Customers keep seeing balances and history |
| Cell independence | One Cell failing is not correlated with any other. They share no database, no cache, no network |
| Release by immutable SHA | Rollback is redeploying an earlier tag, no rebuild involved |
| Synthetic probe every 10 minutes | Availability is measured from outside the VPCs, not asserted from inside |

## 5. Reliability under load, and how we measure it

`deploy/verify/load.sh` saturates one Cell while sampling another surface once a
second throughout.

**The throughput number is not the claim.** These hosts are `t2.small`, 1 vCPU
and 2 GiB, sized to fit a 5 vCPU account quota. Any requests-per-second figure
is a property of that sizing and would be dishonest to present as capacity.

The claim is the comparison: **while one Cell is saturated, does anything else
move?** A flat line means containment holds under load, not only at rest, and
that is a stronger statement than a throughput figure because it is the thing
the architecture actually promises.

## 6. Not built, and why

| Missing | Why |
|---|---|
| Autoscaling group per host | Would give self-healing replacement of a failed instance, which is real value. It needs the host's identity and data to survive replacement, and a Cell's Postgres volume is local. The honest prerequisite is item two below |
| Managed data tier, RDS and ElastiCache | This is the real unlock. With the data layer managed, a Cell's app tier becomes stateless and *can* autoscale behind a load balancer without touching the customer pinning. We run Postgres in a container because runbook P3 rebuilds a Cell live in under four minutes and RDS provisioning alone is fifteen, which does not fit a live demonstration |
| Load balancer and multiple app instances per Cell | Follows from the managed data tier. Not meaningful before it |
| Multi-AZ | One AZ per Cell today. Cells already fail independently of each other, which is the property we prioritised. AZ redundancy within a Cell is the next increment |
| Automatic Cell rebalancing | Deliberately never. See section 2 |
| Verified capacity figures | Nothing has been load tested against a production-sized deployment. We do not quote numbers we have not measured |

## 7. The answer to give

> We scale by adding Cells, and adding one is a single workflow dispatch that
> provisions an isolated VPC and host, generates that Cell's own credentials,
> releases the application, registers it with the control plane and commits the
> config change, in about four minutes. We do not autoscale on load, because
> automatic capacity changes would mean the system reassigning customers between
> Cells, and that would turn blast radius from something we choose into
> something we discover. Within a Cell, autoscaling needs the data tier managed
> rather than containerised, and that is the next increment. What we measure
> today is whether saturating one Cell moves anything else, because that is what
> the architecture actually promises.
