#!/usr/bin/env bash
# Deploy a separate app that queries outage_source on Lakehouse//RT.
# Does not replace reliability-hub or reliability-hub-nolk.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d /tmp/reliability-hub-src.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# Ship app code only: no data generators, docs, other app variants, or deploy scripts.
rsync -a \
  --exclude node_modules \
  --exclude client/dist \
  --exclude dist \
  --exclude .databricks \
  --exclude .bundle \
  --exclude .smoke-test \
  --exclude test-results \
  --exclude playwright-report \
  --exclude scripts \
  --exclude config/queries-src \
  --exclude 'generate_*.py' \
  --exclude 'app.*.yaml' \
  --exclude 'databricks.*.yml' \
  --exclude DEMO.md \
  --exclude TASKS.md \
  --exclude REVISIT-CHAT.md \
  --exclude CLAUDE.md \
  "$ROOT/" "$STAGE/"

cp "$ROOT/app.src.yaml" "$STAGE/app.yaml"
cp "$ROOT/databricks.src.yml" "$STAGE/databricks.yml"

rm -f "$STAGE"/config/queries/*.sql
cp "$ROOT"/config/queries-src/*.sql "$STAGE"/config/queries/

# Bake SOURCE_MODE into the client so funding / FISR / polygons show Coming soon.
printf 'VITE_RELIABILITY_SOURCE=true\n' > "$STAGE/client/.env.production"

cd "$STAGE"
databricks apps deploy --profile "${DATABRICKS_PROFILE:-sea-ws}" --auto-approve --skip-tests
