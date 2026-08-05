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

echo "building arka:phase3 for role=$ROLE"
echo "  NEXT_PUBLIC_IDENTITY_API_URL=$IDENTITY_URL"
echo "  NEXT_PUBLIC_RECOVERY_API_URL=$RECOVERY_API_URL"

docker build \
	--tag arka:phase3 \
	--build-arg "NEXT_PUBLIC_IDENTITY_API_URL=$IDENTITY_URL" \
	--build-arg "NEXT_PUBLIC_RECOVERY_API_URL=$RECOVERY_API_URL" \
	"$REPO_ROOT"

echo "built arka:phase3"
