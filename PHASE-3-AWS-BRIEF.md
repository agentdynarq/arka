# Lane B brief: AWS and Terraform

Paste this to the agent doing the AWS work. Read `docs/PHASE-3-ARCHITECTURE.md` first, sections 1, 3
and 4. That document is the specification. This one is the task list.

## Do this before writing any code

Check the EC2 vCPU quota. Console, Service Quotas, EC2, "Running On-Demand Standard (A, C, D, H, I, M,
R, T, Z) instances". Tier 0 needs **6 vCPU** (three t3 instances, 2 vCPU each). A default of 5 blocks
the whole plan and raising it is a support ticket measured in hours, not minutes.

If the quota is 5 and cannot be raised tonight, report it immediately and stop. The fallback is two
hosts instead of three, with the control plane and Cell 1 sharing a host, which weakens the isolation
demonstration and must be a decision made by a human, not by you.

Then confirm: billing verified, an IAM user with programmatic access, `aws configure` working against
`ap-south-1`, and `aws sts get-caller-identity` returning an account.

## Build this

`infra/terraform/` in the `phase3/deploy` branch of the `arka-phase3` worktree. Region `ap-south-1`.

Two modules, `modules/control` and `modules/cell`, plus a root that instantiates control once and cell
once per tfvars file. The interface for `modules/cell` is specified in section 4 of the architecture
document and must be followed exactly, including the rule that **the module contains no conditional on
`cell_id`**. If you find yourself writing `if cell_id == "cell-1"`, stop and report it: that is an
architecture violation, not a Terraform problem.

Per Cell the module creates: a VPC with the given CIDR, one public subnet, an internet gateway, a route
table, a security group, an Elastic IP, and one EC2 instance running Ubuntu 24.04. No peering
connection, no transit gateway, no shared resource of any kind between Cells. Two Cells must produce
two entirely disjoint sets of AWS objects.

Security group rules are in section 3 of the architecture document. Cell hosts serve 80 and 443
publicly, because customers browse their own Cell directly. The load-bearing rule is the one that does
not exist: **no security group anywhere opens 5432 or 6379.** Databases and Redis stay on the Cell's
internal Docker network with no published host port. If you find yourself adding a database ingress
rule to make something work, stop and report it.

Ordering note: allocate `aws_eip.control` as its own resource before the instance it attaches to, so
the Cell modules can reference its address without a cycle.

Cloud-init on every host installs Docker Engine, the Compose plugin, and Caddy, then creates
`/opt/arka` owned by `ubuntu`. Nothing else. The application arrives separately from Lane A.

Write `cells/cell-1.tfvars`, `cells/cell-2.tfvars`, and `cells/cell-3.tfvars`. **Apply only cell-1 and
cell-2 tonight.** cell-3 exists so it can be applied live in front of the judging panel tomorrow
morning. Do not apply it.

## Definition of done

- `terraform apply` completes and prints three public IPs.
- SSH works to all three hosts as `ubuntu`.
- `docker --version` and `caddy version` succeed on each host.
- From the Cell 1 host, `nc -vz <cell-2-ip> 5432` fails to connect. Capture this output. It is demo
  evidence, not just a test.
- `aws ec2 describe-vpc-peering-connections` returns an empty list. Capture that too.
- From the control plane host, port 443 on both Cell hosts is reachable.
- `terraform destroy` is not run. State stays on the machine that applied it.

## Rules

- Commit to `phase3/deploy` locally. **Do not push to GitHub.** The Phase 2 repository is frozen for
  judging and nothing goes to origin tonight.
- No AWS keys, no `.tfstate`, no `.tfvars` containing secrets committed. Add a `.gitignore` covering
  `*.tfstate*`, `.terraform/`, and `*.pem` before the first commit.
- Commit identity `Hasitha Bandara <hasitha@dynarq.com>`, no AI co-author trailer.
- No em dashes in any file you write.
- If something takes more than 30 minutes to debug, report it rather than continuing. There is a
  fallback and the schedule matters more than this specific approach.

## Report back with

The three public IPs and hostnames, the quota number you found, the `curl` timeout output, and
anything you had to change from the specification along with why.
