#!/usr/bin/env bash
# Checks that every E2E spec is self-sufficient (issue #16): each spec file runs alone against
# an empty database (global setup drops it). The normal full run covers specs running after
# others (no leftover data breaks them); together that's "passes alone or in any order".
# Servers are started once and reused between runs (reuseExistingServer outside CI).
set -uo pipefail
export E2E_PORT="${E2E_PORT:-3200}" FIXTURE_PORT="${FIXTURE_PORT:-3201}"
export E2E_DB_NAME="${E2E_DB_NAME:-dota_den_e2e_isolation}"
failed=()
specs=$(ls tests/e2e/*.spec.ts | sort)
for spec in $specs; do
  if npx playwright test "$spec" --workers=1 --reporter=dot > /tmp/e2e-isolation.log 2>&1; then
    echo "alone ok    $spec"
  else
    echo "alone FAIL  $spec"
    failed+=("$spec (alone)")
  fi
done
if [ ${#failed[@]} -gt 0 ]; then
  printf 'Not isolated: %s\n' "${failed[@]}"
  exit 1
fi
echo "Every spec passes on its own."
