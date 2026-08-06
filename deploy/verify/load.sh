#!/usr/bin/env bash
# Load one Cell and measure what it does to the other.
#
#   deploy/verify/load.sh <cell-under-load-host> <control-host> [seconds] [concurrency]
#
# The number this produces is not the point. Throughput on a 2 GiB t3.small is
# not a claim worth making and we do not make it. The point is the comparison:
# while one Cell is saturated, does the other one's latency move at all?
#
# That is the only load result this architecture actually promises. If Cell 2
# slows down because Cell 1 is busy, they share something they should not, and
# the isolation claim is weaker than the diagram says. If it does not move,
# containment holds under load and not merely at rest, which is a stronger
# statement than any requests-per-second figure.
#
# Uses k6 through Docker so nothing has to be installed. Falls back to a plain
# curl loop if Docker is unavailable.

set -uo pipefail

TARGET="${1:-}"
CONTROL="${2:-}"
DURATION="${3:-60}"
VUS="${4:-30}"

if [[ -z "$TARGET" || -z "$CONTROL" ]]; then
	echo "usage: $0 <cell-under-load-host> <control-host> [seconds] [concurrency]" >&2
	echo "example: $0 cell-1.13.200.0.1.nip.io arka.13.100.0.2.nip.io 60 30" >&2
	exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="load-evidence-$STAMP.txt"

# The quiet Cell, sampled once a second throughout, from this machine.
sample_other_cell() {
	local host="$1" out="$2" deadline=$((SECONDS + DURATION + 10))
	while (( SECONDS < deadline )); do
		local t
		t=$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "https://$host/healthz" 2>/dev/null || echo "timeout")
		echo "$(date -u +%H:%M:%S) $t" >> "$out"
		sleep 1
	done
}

{
	echo "Arka load evidence"
	echo "captured (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	echo "cell under load: $TARGET"
	echo "duration: ${DURATION}s at ${VUS} concurrent"
	echo
	echo "NOTE: hosts are t3.small, 2 vCPU and 2 GiB, the largest free-tier"
	echo "eligible type this account permits. Absolute throughput here is a"
	echo "property of that sizing and is not presented as a capacity claim."
	echo
} | tee "$OUT"

BASELINE=$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "https://$CONTROL/healthz" 2>/dev/null || echo "n/a")
echo "control plane latency before load: ${BASELINE}s" | tee -a "$OUT"

QUIET_LOG="$(mktemp)"
sample_other_cell "$CONTROL" "$QUIET_LOG" &
SAMPLER=$!

echo "generating load..." | tee -a "$OUT"

if command -v docker > /dev/null 2>&1; then
	SCRIPT="$(mktemp --suffix=.js)"
	cat > "$SCRIPT" <<EOF
import http from 'k6/http'
import { check } from 'k6'
export const options = { vus: ${VUS}, duration: '${DURATION}s' }
export default function () {
  const r = http.get('https://${TARGET}/', { timeout: '15s' })
  check(r, { 'served': (res) => res.status === 200 })
}
EOF
	docker run --rm -i grafana/k6 run - < "$SCRIPT" 2>&1 | tee -a "$OUT"
	rm -f "$SCRIPT"
else
	echo "docker unavailable, falling back to a curl loop" | tee -a "$OUT"
	END=$((SECONDS + DURATION))
	COUNT=0
	while (( SECONDS < END )); do
		for _ in $(seq 1 "$VUS"); do
			curl -s -o /dev/null --max-time 15 "https://$TARGET/" &
		done
		wait
		COUNT=$((COUNT + VUS))
	done
	echo "issued ~$COUNT requests" | tee -a "$OUT"
fi

wait "$SAMPLER" 2>/dev/null || true

{
	echo
	echo "=== the result that matters ==="
	echo "Control plane latency sampled once a second THROUGHOUT the load:"
	cat "$QUIET_LOG"
	echo
	echo "Read it against the ${BASELINE}s baseline above. A flat line means one"
	echo "Cell being saturated did not degrade anything else, which is"
	echo "containment holding under load rather than only at rest."
} | tee -a "$OUT"

rm -f "$QUIET_LOG"
echo
echo "written to $OUT"
