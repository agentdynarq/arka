#!/usr/bin/env bash
# Post-deploy smoke test. Run from your laptop once all three hosts are up.
#
#   deploy/verify/smoke.sh <control-ip> <cell-1-ip> <cell-2-ip>
#
# Checks only what a machine can check: every public surface answers, TLS is
# real, and each Cell reports its own identity. The things that actually decide
# the demo, a transfer completing and quarantine containing, are in
# deploy/README.md section 5 and have to be driven in a browser.

set -uo pipefail

CONTROL="${1:-}"
CELL1="${2:-}"
CELL2="${3:-}"

if [[ -z "$CONTROL" || -z "$CELL1" || -z "$CELL2" ]]; then
	echo "usage: $0 <control-ip> <cell-1-ip> <cell-2-ip>" >&2
	exit 2
fi

pass=0
fail=0

check() {
	local label="$1" url="$2" expect="$3"
	local code
	code=$(timeout 20 curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
	if [[ "$code" == "$expect" ]]; then
		printf '  ok    %-38s %s\n' "$label" "$code"
		pass=$((pass + 1))
	else
		printf '  FAIL  %-38s got %s, expected %s\n' "$label" "$code" "$expect"
		fail=$((fail + 1))
	fi
}

tls() {
	local label="$1" host="$2"
	if timeout 20 curl -sS -o /dev/null "https://$host/" 2>/dev/null; then
		printf '  ok    %-38s certificate trusted\n' "$label"
		pass=$((pass + 1))
	else
		printf '  FAIL  %-38s certificate not trusted or host unreachable\n' "$label"
		fail=$((fail + 1))
	fi
}

echo "Control plane"
check "console"            "https://arka.$CONTROL.nip.io/"                200
check "recovery healthz"   "https://arka-api.$CONTROL.nip.io/healthz"     200
check "gateway healthz"    "https://arka-gw.$CONTROL.nip.io/healthz"      200
tls   "console TLS"        "arka.$CONTROL.nip.io"

echo
echo "Cell 1"
check "customer app"       "https://cell-1.$CELL1.nip.io/"                200
check "identity healthz"   "https://cell-1-api.$CELL1.nip.io/healthz"     200
check "unauthenticated"    "https://cell-1-api.$CELL1.nip.io/v1/me/dashboard" 401
tls   "cell 1 TLS"         "cell-1.$CELL1.nip.io"

echo
echo "Cell 2"
check "customer app"       "https://cell-2.$CELL2.nip.io/"                200
check "identity healthz"   "https://cell-2-api.$CELL2.nip.io/healthz"     200
check "unauthenticated"    "https://cell-2-api.$CELL2.nip.io/v1/me/dashboard" 401
tls   "cell 2 TLS"         "cell-2.$CELL2.nip.io"

echo
echo "Database ports must NOT be reachable from here"
for target in "$CELL1" "$CELL2" "$CONTROL"; do
	if timeout 8 nc -z "$target" 5432 2>/dev/null; then
		printf '  FAIL  %-38s 5432 is open to the internet\n' "$target"
		fail=$((fail + 1))
	else
		printf '  ok    %-38s 5432 closed\n' "$target"
		pass=$((pass + 1))
	fi
done

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]] || exit 1
