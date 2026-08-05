#!/usr/bin/env bash
# Capture the evidence for Arka's central claim, from a Cell host.
#
# Run this ON a Cell host, pointed at a DIFFERENT Cell. It writes a timestamped
# transcript you can show a judge, rather than retyping commands while someone
# watches.
#
#   deploy/verify/isolation-evidence.sh <other-cell-private-ip> <other-cell-api-host>
#
# Example, run on the Cell 1 host:
#   deploy/verify/isolation-evidence.sh 10.2.1.10 cell-2-api.13.200.0.2.nip.io
#
# What this proves, and what it does not, is stated in
# docs/PHASE-3-ARCHITECTURE.md section 3. Read it before presenting the output.
# In particular: reaching another Cell's public web port is NOT a failure. Every
# laptop on earth can do that. The claim is about credentials and data paths.

set -uo pipefail

OTHER_IP="${1:-}"
OTHER_API="${2:-}"

if [[ -z "$OTHER_IP" || -z "$OTHER_API" ]]; then
	echo "usage: $0 <other-cell-private-ip> <other-cell-api-host>" >&2
	exit 2
fi

OUT="isolation-evidence-$(date -u +%Y%m%dT%H%M%SZ).txt"

{
	echo "Arka Cell isolation evidence"
	echo "captured (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	echo "captured on host: $(hostname), $(hostname -I 2>/dev/null | awk '{print $1}')"
	echo "target Cell: $OTHER_IP / $OTHER_API"
	echo
	echo "=============================================================="
	echo "1. DATA LAYER. No route into the other Cell's database."
	echo "=============================================================="
	echo "\$ nc -vz $OTHER_IP 5432"
	timeout 15 nc -vz "$OTHER_IP" 5432 2>&1 || echo "[exit $?] connection did not succeed, which is the expected result"
	echo
	echo "\$ nc -vz $OTHER_IP 6379"
	timeout 15 nc -vz "$OTHER_IP" 6379 2>&1 || echo "[exit $?] connection did not succeed, which is the expected result"
	echo
	echo "=============================================================="
	echo "2. CREDENTIAL LAYER. This Cell holds nothing belonging to any"
	echo "   other Cell. Every value below names this Cell only."
	echo "=============================================================="
	echo "\$ docker compose -f deploy/cell/docker-compose.yml exec identity env | grep -iE 'cell|database|redis'"
	docker compose -f deploy/cell/docker-compose.yml exec -T identity \
		sh -c "env | grep -iE 'cell|database|redis' | sed -E 's/(PASSWORD|KEY)=.*/\1=<redacted>/'" 2>&1 \
		|| echo "[could not reach the identity container]"
	echo
	echo "=============================================================="
	echo "3. APPLICATION LAYER. The other Cell answers this host exactly"
	echo "   as it answers a stranger. An address is not access."
	echo "=============================================================="
	echo "\$ curl -s -o /dev/null -w '%{http_code}' https://$OTHER_API/v1/me/dashboard"
	timeout 20 curl -s -o /dev/null -w '%{http_code}\n' "https://$OTHER_API/v1/me/dashboard" 2>&1 \
		|| echo "[request failed]"
	echo "expected: 401"
	echo
	echo "=============================================================="
	echo "4. INFRASTRUCTURE. No peering connection exists in the account."
	echo "   Run from a machine with AWS credentials, not from the host."
	echo "=============================================================="
	echo "\$ aws ec2 describe-vpc-peering-connections --query 'VpcPeeringConnections[*].VpcPeeringConnectionId'"
	echo "(run separately, output pasted below by hand)"
	echo
	echo "end of capture"
} | tee "$OUT"

echo
echo "written to $OUT"
