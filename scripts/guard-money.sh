#!/usr/bin/env bash
# Money is bigint minor units. Floating point is how you lose real cash.
#
# ESLint already bans these in payments and ledger. This grep is the backstop for
# the case where a file is excluded, a rule is disabled inline, or the lint config
# is edited in the same PR that introduces the bug.
set -uo pipefail
cd "$(dirname "$0")/.."

DIRS="src/modules/payments src/modules/ledger"
PATTERN='parseFloat|parseInt\(|[^a-zA-Z_.]Number\(|toFixed\(|Math\.round\('

found=0
for d in $DIRS; do
  [ -d "$d" ] || continue
  # A deliberate exception must say why on the same line: "// money-guard: <reason>"
  hits=$(grep -rnE "$PATTERN" "$d" --include='*.ts' 2>/dev/null | grep -v 'money-guard:' || true)
  if [ -n "$hits" ]; then
    echo "Floating-point arithmetic on money in $d:"
    echo "$hits"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  cat <<'MSG'

Money is bigint minor units and crosses the wire as a string. See docs/adr.
If this is genuinely safe, annotate the line:
    const x = Number(notMoney); // money-guard: page size, not an amount
MSG
  exit 1
fi
echo "Money guard clean."
