# Arka Phase 3 infrastructure

One VPC per Cell plus one control plane VPC, `ap-south-1`, no peering, no transit gateway, no shared
resource between Cells. See `../../docs/PHASE-3-ARCHITECTURE.md` for the design this implements.

Instance sizing deviates from that doc's `t3.medium` everywhere: this account's EC2 vCPU quota is 5,
and three `t3.medium` (2 vCPU each) needs 6. Using `t2.medium` (2 vCPU, 4 GiB) for control and
`t2.small` (1 vCPU, 2 GiB) for each Cell keeps every host with enough memory to run its stack while
staying at 4 vCPU with two Cells up, and exactly 5, the account ceiling, once Cell 3 joins.

## One-time setup

1. An EC2 key pair in `ap-south-1`, not created by Terraform so the private key is never in state:

   ```bash
   aws ec2 create-key-pair --key-name arka-phase3 --region ap-south-1 \
     --query 'KeyMaterial' --output text > arka-phase3.pem
   chmod 400 arka-phase3.pem
   ```

2. Your current public IP, as a `/32`:

   ```bash
   curl https://checkip.amazonaws.com
   ```

3. `terraform init` in this directory.

## Apply cell-1 and cell-2 tonight

```bash
terraform apply \
  -var-file=cells/cell-1.tfvars \
  -var-file=cells/cell-2.tfvars \
  -var operator_ip="<your IP>/32"
```

`cells/cell-3.tfvars` exists on disk and is deliberately not passed here.

## Apply cell-3 in front of the panel tomorrow

Pass every Cell's tfvars together, not just cell-3's. Omitting cell-1 or cell-2's file makes Terraform
see that variable revert to null and destroy the Cell, which is the opposite of the point.

```bash
terraform apply \
  -var-file=cells/cell-1.tfvars \
  -var-file=cells/cell-2.tfvars \
  -var-file=cells/cell-3.tfvars \
  -var operator_ip="<your IP>/32"
```

## Definition of done, and how to capture the evidence

Run these against the real output once applied. Capture the terminal output of each, this is demo
evidence, not just a sanity check.

```bash
terraform output -json
```

SSH to each host as `ubuntu` using `arka-phase3.pem`, confirm tooling:

```bash
ssh -i arka-phase3.pem ubuntu@<public-ip> 'docker --version && docker compose version && git --version'
```

From the Cell 1 host, confirm no route to Cell 2's private services:

```bash
ssh -i arka-phase3.pem ubuntu@<cell-1-public-ip> \
  "nc -vz <cell-2-private-ip> 5432"
```

Expect this to fail to connect. Capture the output.

Confirm no peering connection exists anywhere in the account:

```bash
aws ec2 describe-vpc-peering-connections --region ap-south-1
```

Expect an empty list. Capture that too.

From the control plane host, confirm both Cells are reachable on 443:

```bash
ssh -i arka-phase3.pem ubuntu@<control-public-ip> \
  "curl -sk -o /dev/null -w '%{http_code}\n' https://<cell-1-public-ip>/ ; \
   curl -sk -o /dev/null -w '%{http_code}\n' https://<cell-2-public-ip>/"
```

## What Hasitha's lane needs from this

Run `terraform output -json` and hand over:

- Both Cells' `private_ip`, for the control plane's `.env` (`RECOVERY_URL` per Cell, health checks).
- All three public IPs, for the `nip.io` hostnames in each `deploy/**/.env`.

`terraform destroy` is not run, and stays not run until results are announced.
