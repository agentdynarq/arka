#!/usr/bin/env bash
# Run one command on one EC2 host over Systems Manager, and fail loudly.
#
#   .github/scripts/ssm-run.sh <instance-id> <comment> <command>
#
# Shared by the deploy and add-cell workflows so the send, wait, status check
# and log retrieval exist once rather than being copied and drifting apart.
#
# `aws ssm wait command-executed` returns non-zero for a failed command as well
# as for a timeout, so its exit code cannot distinguish them. The status is read
# explicitly afterwards instead, and stdout is always printed: a release that
# fails silently is worse than one that fails.

set -euo pipefail

INSTANCE="${1:-}"
COMMENT="${2:-arka}"
COMMAND="${3:-}"
TIMEOUT="${SSM_TIMEOUT:-900}"

if [[ -z "$INSTANCE" || -z "$COMMAND" ]]; then
	echo "usage: $0 <instance-id> <comment> <command>" >&2
	exit 2
fi

echo "==> $INSTANCE: $COMMENT"

CMD_ID=$(aws ssm send-command \
	--instance-ids "$INSTANCE" \
	--document-name AWS-RunShellScript \
	--comment "$COMMENT" \
	--parameters commands="$(jq -Rn --arg c "$COMMAND" '[$c]')" \
	--timeout-seconds "$TIMEOUT" \
	--query Command.CommandId --output text)

echo "==> ssm command $CMD_ID"

aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE" > /dev/null 2>&1 || true

STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query Status --output text)

echo "--- stdout ---"
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query StandardOutputContent --output text

if [[ "$STATUS" != "Success" ]]; then
	echo "--- stderr ---" >&2
	aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE" --query StandardErrorContent --output text >&2
	echo "!! $COMMENT failed on $INSTANCE with status $STATUS" >&2
	exit 1
fi

echo "==> ok"
