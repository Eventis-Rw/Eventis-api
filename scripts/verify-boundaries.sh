#!/usr/bin/env bash
# Proves the module boundary rules actually fail on a violation.
# A rule nobody has watched fail is a comment, not a rule. Runs in CI.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
check() {
  local name="$1" file="$2" body="$3"
  printf '%-58s ' "$name"
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$body" > "$file"
  if bunx depcruise src --config .dependency-cruiser.cjs >/dev/null 2>&1; then
    echo "NOT CAUGHT — the rule does not work"
    fail=1
  else
    echo "caught"
  fi
  rm -f "$file"
}

check 'a module may not reach past another module index.ts' \
  src/modules/commerce/application/__violation.ts \
  "import { CategoryRepository } from '../../catalog/infrastructure/category.repository.js';
export const bad = CategoryRepository;"

check 'domain may not import infrastructure' \
  src/modules/catalog/domain/__violation.ts \
  "import { CategoryRepository } from '../infrastructure/category.repository.js';
export const bad = CategoryRepository;"

check 'domain may not import the framework' \
  src/modules/catalog/domain/__violation.ts \
  "import { Injectable } from '@nestjs/common';
export const bad = Injectable;"

check 'a controller may not import a repository' \
  src/modules/catalog/api/__violation.ts \
  "import { CategoryRepository } from '../infrastructure/category.repository.js';
export const bad = CategoryRepository;"

check 'a controller may not import drizzle' \
  src/modules/catalog/api/__violation.ts \
  "import { eq } from 'drizzle-orm';
export const bad = eq;"

check 'a repository may not import its service' \
  src/modules/catalog/infrastructure/__violation.ts \
  "import { CatalogService } from '../application/catalog.service.js';
export const bad = CatalogService;"

check 'catalog may not reach the ledger' \
  src/modules/catalog/application/__violation.ts \
  "export { x } from '../../ledger/index.js';"

echo
if [ "$fail" -ne 0 ]; then
  echo "FAIL: at least one boundary rule does not actually enforce anything."
  exit 1
fi
echo "All boundary rules verified to fail on a violation."
