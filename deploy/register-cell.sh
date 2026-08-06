#!/usr/bin/env bash
# Tell the control plane that a new Cell exists.
#
# Runs ON the control plane host, invoked over SSM by the add-cell workflow.
#
#   deploy/register-cell.sh <cell-id> <cell-public-ip>
#
# This is the only place in the entire system that learns about more than one
# Cell, which is the design rather than an accident. A Cell is never told about
# another Cell, so registration only ever happens here.
#
# Idempotent: running it twice for the same Cell changes nothing.

set -euo pipefail

CELL_ID="${1:-}"
CELL_IP="${2:-}"

if [[ -z "$CELL_ID" || -z "$CELL_IP" ]]; then
	echo "usage: $0 <cell-id> <cell-public-ip>" >&2
	exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
ENV_FILE="$REPO_ROOT/deploy/control/.env"
COMPOSE="$REPO_ROOT/deploy/control/docker-compose.yml"

# cell-3 becomes CELL3, matching the naming apps/recovery already reads.
PREFIX="$(echo "$CELL_ID" | tr -d '-' | tr '[:lower:]' '[:upper:]')"
DB="arka_${CELL_ID//-/}"

[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

if grep -q "^${PREFIX}_POSTGRES_HOST=" "$ENV_FILE"; then
	echo "==> $CELL_ID is already registered, nothing to do"
	exit 0
fi

secret() {
	aws ssm get-parameter \
		--name "/arka/$CELL_ID/$1" \
		--with-decryption \
		--region "$REGION" \
		--query Parameter.Value \
		--output text
}

echo "==> reading $CELL_ID's credentials from Parameter Store"
POSTGRES_PASSWORD="$(secret postgres_password)"
REDIS_PASSWORD="$(secret redis_password)"

cp "$ENV_FILE" "$ENV_FILE.bak.$(date -u +%Y%m%dT%H%M%SZ)"

echo "==> appending $CELL_ID to the control plane configuration"
# The Cell's PUBLIC address: separate VPCs with no peering means the private
# one does not route from here. See docs/PHASE-3-ARCHITECTURE.md section 3.
cat >> "$ENV_FILE" <<ENVFILE

${PREFIX}_POSTGRES_HOST=$CELL_IP
${PREFIX}_POSTGRES_PORT=5432
${PREFIX}_POSTGRES_USER=$DB
${PREFIX}_POSTGRES_PASSWORD=$POSTGRES_PASSWORD
${PREFIX}_POSTGRES_DB=$DB
${PREFIX}_REDIS_HOST=$CELL_IP
${PREFIX}_REDIS_PORT=6379
${PREFIX}_REDIS_PASSWORD=$REDIS_PASSWORD
ENVFILE

echo "==> adding $CELL_ID to CELL_IDS"
CURRENT="$(grep '^CELL_IDS=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [[ ",$CURRENT," != *",$CELL_ID,"* ]]; then
	UPDATED="$CURRENT,$CELL_ID"
	# Rewrite in place rather than append, so there is exactly one CELL_IDS line.
	grep -v '^CELL_IDS=' "$ENV_FILE" > "$ENV_FILE.tmp"
	printf 'CELL_IDS=%s\n' "$UPDATED" >> "$ENV_FILE.tmp"
	mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

chown ubuntu:ubuntu "$ENV_FILE" 2>/dev/null || true
chmod 600 "$ENV_FILE"

echo "==> restarting the services that read the Cell list"
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" up -d recovery gateway

echo "==> waiting for the control plane to report the new Cell"
for _ in $(seq 1 24); do
	if curl -fsS --max-time 5 http://localhost:3002/v1/recovery/health-map 2>/dev/null | grep -q "$CELL_ID"; then
		echo "==> $CELL_ID is on the health map"
		exit 0
	fi
	sleep 5
done

echo "!! $CELL_ID did not appear on the health map within 120s" >&2
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" logs --tail 30 recovery >&2
exit 1
