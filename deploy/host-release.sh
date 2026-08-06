#!/usr/bin/env bash
# Release one host to a specific, already-built image.
#
# Runs ON an EC2 host, invoked by the deploy pipeline over AWS Systems Manager.
# It never builds anything: the image was built once in CI and pushed to ECR,
# tagged with the git SHA that produced it. A Cell host has 2 GiB of RAM and
# cannot compile the front end, and more importantly a release should deploy the
# artefact that was tested, not recompile it and hope.
#
# Usage, from /opt/arka:
#   deploy/host-release.sh <cell|control> <full-ecr-image-uri>
#
# Idempotent. Running it twice with the same image is a no-op that leaves the
# stack healthy. Rolling back is running it again with an older SHA.

set -euo pipefail

ROLE="${1:-}"
IMAGE="${2:-}"

if [[ "$ROLE" != "cell" && "$ROLE" != "control" ]]; then
	echo "usage: $0 [cell|control] <image-uri>" >&2
	exit 2
fi
if [[ -z "$IMAGE" ]]; then
	echo "an image URI is required. This script does not build." >&2
	exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$REPO_ROOT/deploy/$ROLE/docker-compose.yml"
ENV_FILE="$REPO_ROOT/deploy/$ROLE/.env"

# Container logs go to CloudWatch when the host is configured for it, via an
# overlay file rather than the base compose, so the same compose file still
# runs on a laptop with no AWS account. Set ARKA_CLOUDWATCH_LOGS=true in the
# host's .env once the instance profile grants logs:PutLogEvents.
CW_OVERLAY="$REPO_ROOT/deploy/$ROLE/docker-compose.cloudwatch.yml"
COMPOSE_FILES=(-f "$COMPOSE")
if grep -qs '^ARKA_CLOUDWATCH_LOGS=true' "$ENV_FILE" && [[ -f "$CW_OVERLAY" ]]; then
	COMPOSE_FILES+=(-f "$CW_OVERLAY")
	echo "==> container logs will ship to CloudWatch"
fi

if [[ ! -f "$ENV_FILE" ]]; then
	echo "missing $ENV_FILE. It holds this host's secrets and is created once, by hand, and never committed." >&2
	exit 1
fi

echo "==> releasing role=$ROLE image=$IMAGE"

# Authenticate to ECR. The instance profile grants the pull; no credentials are
# stored on the host and none are passed in.
REGISTRY="${IMAGE%%/*}"
REGION="$(echo "$REGISTRY" | sed -E 's/.*\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com/\1/')"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> pulling"
docker pull "$IMAGE"

echo "==> starting"
ARKA_IMAGE="$IMAGE" docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d --remove-orphans

echo "==> waiting for health"
DEADLINE=$((SECONDS + 240))
while (( SECONDS < DEADLINE )); do
	UNHEALTHY=$(docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" ps --format json 2>/dev/null \
		| grep -c '"Health":"starting"\|"Health":"unhealthy"' || true)
	if [[ "$UNHEALTHY" == "0" ]]; then
		echo "==> all services healthy"
		ARKA_IMAGE="$IMAGE" docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" ps
		# Keep one previous image so a rollback does not depend on the network.
		docker image prune -f --filter "until=72h" > /dev/null 2>&1 || true
		echo "==> released $IMAGE"
		exit 0
	fi
	sleep 5
done

echo "!! services did not reach healthy within 240s" >&2
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" ps >&2
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" logs --tail 40 >&2
exit 1
