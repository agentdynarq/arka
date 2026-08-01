#!/usr/bin/env bash
# Drives the running stack (docker compose already up, apps already built and
# started with `pnpm build && pnpm start`) via its real HTTP APIs into the
# backend state each capture screenshot needs. The actual JSON/fetch logic
# lives in lib/capture-setup.mjs; this is the entry point the rest of the
# team runs.
#
# Usage:
#   scripts/capture-setup.sh                     same as "baseline"
#   scripts/capture-setup.sh baseline             cell-1 healthy, seed and MFA demo endpoint verified.
#                                                  Capture screenshots a, b, d, e from here.
#   scripts/capture-setup.sh quarantine-pending    cell-1 into pending_second_approval (operator-priya
#                                                  requested, operator-nadeesha has not approved).
#                                                  Capture screenshot c from here.
#   scripts/capture-setup.sh restore              lift any quarantine, back to healthy. Run this last
#                                                  so the stack is left clean for the next lane.
#
# Every mode is idempotent: safe to run from a clean boot and safe to re-run
# after a previous run left the Cell in any state.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$HERE/lib/capture-setup.mjs" "${1:-baseline}"
