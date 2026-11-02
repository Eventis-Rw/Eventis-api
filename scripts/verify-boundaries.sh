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
  src/modules/orders/application/__violation.ts \
  "import { EventRepository } from '../../events/infrastructure/event.repository.js';
export const bad = EventRepository;"

check 'domain may not import infrastructure' \
  src/modules/events/domain/__violation.ts \
  "import { EventRepository } from '../infrastructure/event.repository.js';
export const bad = EventRepository;"

check 'domain may not import the framework' \
  src/modules/events/domain/__violation.ts \
  "import { Injectable } from '@nestjs/common';
export const bad = Injectable;"

check 'a controller may not import a repository' \
  src/modules/events/api/__violation.ts \
  "import { EventRepository } from '../infrastructure/event.repository.js';
export const bad = EventRepository;"

check 'a controller may not import prisma' \
  src/modules/events/api/__violation.ts \
  "import { PrismaClient } from '@prisma/client';
export const bad = PrismaClient;"

check 'a repository may not import its service' \
  src/modules/events/infrastructure/__violation.ts \
  "import { CreateEventService } from '../application/create-event.service.js';
export const bad = CreateEventService;"

check 'events may not reach the ledger' \
  src/modules/events/application/__violation.ts \
  "export { x } from '../../ledger/index.js';"

echo
if [ "$fail" -ne 0 ]; then
  echo "FAIL: at least one boundary rule does not actually enforce anything."
  exit 1
fi
echo "All boundary rules verified to fail on a violation."
