#!/usr/bin/env bash
# Build a manual-deploy zip for the destination workspace.
# Does not change or deploy the live reliability-hub-src app.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/../reliability-hub-serverless_sea202601_catalog.zip}"
STAGE="$(mktemp -d /tmp/reliability-hub-pd.XXXXXX)"
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
  --exclude scripts \
  --exclude config/queries-src \
  --exclude config/agents \
  --exclude 'generate_*.py' \
  --exclude 'app.*.yaml' \
  --exclude 'databricks.*.yml' \
  --exclude DEMO.md \
  --exclude TASKS.md \
  --exclude REVISIT-CHAT.md \
  --exclude CLAUDE.md \
  --exclude AGENTS.md \
  --exclude tests \
  "$ROOT/" "$STAGE/"

rm -f "$STAGE"/config/queries/*.sql
cp "$ROOT"/config/queries-src/*.sql "$STAGE"/config/queries/
rm -rf "$STAGE"/config/agents "$STAGE"/server/agents

# Source tables: prod catalog (read). App state: dv volume (write).
  "$STAGE"/config/queries/*.sql \
  "$STAGE"/server/state/volume-store.ts

perl -pi -e 's#/Volumes/serverless_sea202601_catalog/reliability_app/state/app_state.json#/Volumes/serverless_sea202601_catalog/outage_source/reliability_poc/state/app_state.json#g' \
  "$STAGE"/server/state/volume-store.ts
perl -pi -e 's#/Workspace/Shared/reliability-hub-nolk/app_state.json#/Volumes/serverless_sea202601_catalog/outage_source/reliability_poc/state/app_state.json#g' \
  "$STAGE"/server/state/volume-store.ts

# Volume already exists; do not CREATE SCHEMA/VOLUME on the read-only prod catalog.
python3 - <<'PY'
from pathlib import Path
p = Path("/tmp")  # placeholder, overwritten below
PY
python3 - "$STAGE/server/state/volume-store.ts" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
old = '''  private async ensureVolume() {
    const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
    if (!warehouseId) return;
    try {
      await this.workspace.statementExecution.executeStatement({
        warehouse_id: warehouseId,
        statement: 'CREATE SCHEMA IF NOT EXISTS serverless_sea202601_catalog.reliability_app',
        wait_timeout: '50s',
      });
      await this.workspace.statementExecution.executeStatement({
        warehouse_id: warehouseId,
        statement: 'CREATE VOLUME IF NOT EXISTS serverless_sea202601_catalog.reliability_app.state',
        wait_timeout: '50s',
      });
    } catch (err) {
      console.warn('[app-state] could not ensure volume (will try write paths):', (err as Error).message);
    }
  }'''
new = '''  private async ensureVolume() {
    // Destination pack writes under an existing volume:
    // /Volumes/serverless_sea202601_catalog/outage_source/reliability_poc/state/
  }'''
if old not in text:
    raise SystemExit('ensureVolume block not found for pack rewrite')
p.write_text(text.replace(old, new, 1))
PY

perl -pi -e 's/polygons are not in the 25 tables/source data not available yet/g' \
  "$STAGE"/config/queries/workgroup_rank.obo.sql
perl -pi -e 's/not in the 25-table contract/source data not available yet/g' \
  "$STAGE"/config/queries/kpi_ytd.obo.sql

perl -pi -e 's/Answers from Reliability gold data/Answers from Reliability gold data — coming soon/g' \
  "$STAGE"/client/src/components/AssistantDock.tsx

printf 'VITE_RELIABILITY_SOURCE=true\n' > "$STAGE/client/.env.production"

cat > "$STAGE/app.yaml" <<'EOF'
command: ['npm', 'run', 'start']
env:
  - name: DATABRICKS_WAREHOUSE_ID
    value: 9140d8a067dca129
  - name: DATABRICKS_GENIE_SPACE_ID
    value: 01f123a7dfa31deda97e4638ef372d99
  - name: RELIABILITY_STATE_BACKEND
    value: volume
  - name: RELIABILITY_DATA_MODE
    value: source
  - name: RELIABILITY_STATE_PATH
    value: /Volumes/serverless_sea202601_catalog/outage_source/reliability_poc/state/app_state.json
EOF

cat > "$STAGE/databricks.yml" <<'EOF'
bundle:
  name: reliability-hub

resources:
  apps:
    app:
      name: "reliability-hub"
      description: "Reliability Hub on outage_source via a serverless SQL warehouse"
      source_code_path: ./
      user_api_scopes:
        - sql
        - dashboards.genie

targets:
  default:
    default: true
    workspace:
      host: https://YOUR-WORKSPACE.cloud.databricks.com
EOF

cat > "$STAGE/README.md" <<'EOF'
# Reliability Hub (destination pack)

Source-table app for a workspace that has `serverless_sea202601_catalog.outage_source`.
Charts run as the signed-in user (OBO). App state is a UC volume, not Lakebase.

## Wired in this pack

- **Analytics catalog:** `serverless_sea202601_catalog.outage_source` (read)
- **SQL warehouse:** `9140d8a067dca129` (serverless ID in env; queries use OBO via `sql`, not an app resource)
- **Genie space:** `01f123a7dfa31deda97e4638ef372d99` (placeholder ID; conversations use OBO via `dashboards.genie`, not an app resource)
- **Assistant title:** Reliability assistant
- **Assistant subtitle:** Answers from Reliability gold data — coming soon
- **App state:** `/Volumes/serverless_sea202601_catalog/outage_source/reliability_poc/state/app_state.json`

Set `workspace.host` in `databricks.yml` to the destination workspace before a bundle deploy.
The app name is chosen when you create the Databricks App; `reliability-hub` in the bundle is a default.

## Manual deploy

1. Unzip this pack.
2. In `databricks.yml`, replace `https://YOUR-WORKSPACE.cloud.databricks.com`.
3. Either:
   - `databricks bundle deploy` then `databricks bundle run`, or
   - Create a Databricks App in the UI, upload this folder, keep the `sql` and `dashboards.genie` user scopes, and start the app. Do not attach a warehouse or Genie space as app resources; both IDs are already in `app.yaml`.
4. Grant the app identity `SELECT` on `serverless_sea202601_catalog.outage_source` and `READ VOLUME` / `WRITE VOLUME` on `serverless_sea202601_catalog.outage_source.reliability_poc`.

Genie is a placeholder until the gold-data space is available. The chat chrome already says coming soon.
EOF

# Drop leftover sea-ws / 25-table / agent notes if any slipped in.
find "$STAGE" -type f \( -name '*.md' -o -name '*.sql' -o -name '*.yml' \) \
  ! -path '*/node_modules/*' \
  -print0 | xargs -0 perl -pi -e 's/\b25 tables\b/source data/g; s/\b25-table\b/source-data/g'

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(
  cd "$STAGE"
  zip -rq "$OUT" . \
    -x '*.DS_Store' \
    -x '.git/*' \
    -x '.env' \
    -x '.env.local'
)

echo "Wrote $OUT"
unzip -l "$OUT" | awk 'NR==1 || /databricks.yml|app.yaml|README|queries\/incidents|volume-store|AssistantDock/'
