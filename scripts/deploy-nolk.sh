#!/usr/bin/env bash
# Deploy the no-Lakebase app without touching the existing reliability-hub app.yaml.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d /tmp/reliability-hub-nolk.XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

rsync -a \
  --exclude node_modules \
  --exclude client/dist \
  --exclude dist \
  --exclude .databricks \
  --exclude .bundle \
  --exclude .smoke-test \
  --exclude test-results \
  --exclude playwright-report \
  "$ROOT/" "$STAGE/"

cp "$ROOT/app.nolk.yaml" "$STAGE/app.yaml"
cp "$ROOT/databricks.nolk.yml" "$STAGE/databricks.yml"

# Charts on Lakehouse//RT cannot read UC row filters on reliability_gold.
# Point nolk SQL at the unfiltered clone; leave repo queries on reliability_gold
# so the Lakebase app and Genie keep visible_opco.
perl -pi -e 's/reliability_gold\./reliability_gold_rt./g' "$STAGE"/config/queries/*.sql

cd "$STAGE"
databricks apps deploy --profile "${DATABRICKS_PROFILE:-sea-ws}" --auto-approve --skip-tests
