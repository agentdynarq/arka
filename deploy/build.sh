#!/usr/bin/env bash
# Build the Arka image on this host.
#
# Run on the host that will run the containers, never on a laptop, because
# @node-rs/argon2 is a native module and an install performed on one platform
# does not run on another.
#
# Usage, from the repository root:
#   deploy/build.sh cell     deploy/cell/.env must exist
#   deploy/build.sh control  deploy/control/.env must exist
#
# NEXT_PUBLIC_* values are inlined by Next at build time, not read at run time,
# so the hostnames have to be known here. That is why each host builds its own
# image rather than pulling a shared one.

set -euo pipefail

ROLE="${1:-}"
if [[ "$ROLE" != "cell" && "$ROLE" != "control" ]]; then
	echo "usage: deploy/build.sh [cell|control]" >&2
	exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/$ROLE/.env"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "missing $ENV_FILE. Copy $ROLE/.env.example and fill it in." >&2
	exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

if [[ "$ROLE" == "cell" ]]; then
	: "${API_HOST:?API_HOST must be set in $ENV_FILE}"
	IDENTITY_URL="https://$API_HOST"
	RECOVERY_API_URL=""
else
	: "${API_HOST:?API_HOST must be set in $ENV_FILE}"
	IDENTITY_URL=""
	RECOVERY_API_URL="https://$API_HOST"
fi

# Hosts are t3.small: 2 vCPU and 2 GiB. The account is restricted to
# free-tier-eligible instance types, and t3.medium is not one.
#
# 2 GiB is enough to RUN the stack. It is not enough to BUILD it: `next build`
# alone routinely peaks above that, and the OOM killer takes the build with a
# message that looks nothing like a memory problem. Swap makes it slow instead
# of fatal, which is the correct trade at 2 GiB.
TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/ {print $2}')

if [[ "$TOTAL_MB" -lt 4000 && "$SWAP_MB" -lt 2000 ]]; then
	echo "host has ${TOTAL_MB}MB RAM and ${SWAP_MB}MB swap. Adding 4G of swap before building."
	if [[ ! -f /swapfile ]]; then
		sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
		sudo chmod 600 /swapfile
		sudo mkswap /swapfile
	fi
	sudo swapon /swapfile || true
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
	echo "swap now: $(free -m | awk '/^Swap:/ {print $2}')MB"
fi

echo "building arka:phase3 for role=$ROLE"
echo "  NEXT_PUBLIC_IDENTITY_API_URL=$IDENTITY_URL"
echo "  NEXT_PUBLIC_RECOVERY_API_URL=$RECOVERY_API_URL"

docker build \
	--tag arka:phase3 \
	--build-arg "NEXT_PUBLIC_IDENTITY_API_URL=$IDENTITY_URL" \
	--build-arg "NEXT_PUBLIC_RECOVERY_API_URL=$RECOVERY_API_URL" \
	"$REPO_ROOT"

echo "built arka:phase3"
