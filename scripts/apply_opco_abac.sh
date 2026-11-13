#!/usr/bin/env bash
# Apply OpCo row security via Unity Catalog ABAC.
# Drops legacy table-level SET ROW FILTER (which blocks Lakebase synced tables).
set -euo pipefail

PROFILE="${1:-sea-ws}"
WH="${WAREHOUSE_ID:-b7469619d98a1547}"
CATALOG="${CATALOG:-serverless_sea202601_catalog}"
SCHEMA="${SCHEMA:-reliability_gold}"

run_sql() {
  local stmt="$1"
  local label="${2:-sql}"
  python3 -c "
import json
open('/tmp/abac_stmt.json','w').write(json.dumps({
  'warehouse_id': '$WH',
  'wait_timeout': '50s',
  'statement': '''${stmt//$'\n'/\\n}''',
}))
" 2>/dev/null || true
  python3 <<PY
import json
open('/tmp/abac_stmt.json','w').write(json.dumps({
  "warehouse_id": "$WH",
  "wait_timeout": "50s",
  "statement": """$stmt""",
}))
PY
  out=$(databricks api post /api/2.0/sql/statements --profile "$PROFILE" --json @/tmp/abac_stmt.json)
  python3 -c "import json,sys;d=json.loads(sys.argv[1]);s=d.get('status',{});e=(s.get('error') or {}).get('message','');print(sys.argv[2], s.get('state'), (e or '')[:220])" "$out" "$label"
}

echo "== governed tag"
run_sql "CREATE GOVERNED TAG IF NOT EXISTS opco DESCRIPTION 'OpCo / company_code for Reliability Hub ABAC'" "governed_tag" || true

echo "== drop legacy table-level row filters"
TABLES=(
  company_breakdown customer_incidents cx_metrics devices feeder_briefs incidents
  inspection_device_risk inspection_findings kpi_goals kpi_monthly kpi_ytd
  reliability_rankings resiliency_yearly restoration_program workgroup_boundaries
  worst_performing_feeders
)
for t in "${TABLES[@]}"; do
  run_sql "ALTER MATERIALIZED VIEW ${CATALOG}.${SCHEMA}.${t} DROP ROW FILTER" "drop_${t}" || true
done

USER=$(databricks current-user me --profile "$PROFILE" -o json | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('userName') or d.get('email'))")
echo "== EXCEPT principal: $USER"

echo "== ACL + UDF"
run_sql "USE CATALOG ${CATALOG}" "use_cat"
run_sql "USE SCHEMA ${SCHEMA}" "use_sch"
run_sql "CREATE TABLE IF NOT EXISTS user_opco_acl (user_email STRING NOT NULL, company_code STRING NOT NULL, role STRING, granted_at TIMESTAMP) USING DELTA" "acl_table"
run_sql "MERGE INTO user_opco_acl AS t USING (SELECT lower(session_user()) AS user_email, company_code, role FROM VALUES ('ALL','executive'),('OC1','executive'),('OC2','executive'),('OC3','executive') AS v(company_code, role)) AS s ON lower(t.user_email)=s.user_email AND t.company_code=s.company_code WHEN NOT MATCHED THEN INSERT (user_email, company_code, role, granted_at) VALUES (s.user_email, s.company_code, s.role, current_timestamp())" "acl_merge"

run_sql "CREATE OR REPLACE FUNCTION visible_opco(opco STRING) RETURNS BOOLEAN COMMENT 'ABAC OpCo visibility UDF' RETURN (is_account_group_member('reliability-exec-all') OR (opco='OC1' AND is_account_group_member('reliability-opco-oc1')) OR (opco='OC2' AND is_account_group_member('reliability-opco-oc2')) OR (opco='OC3' AND is_account_group_member('reliability-opco-oc3')) OR EXISTS (SELECT 1 FROM user_opco_access a WHERE lower(a.user_email)=lower(session_user()) AND (a.company_code=opco OR a.company_code='ALL')) OR EXISTS (SELECT 1 FROM user_opco_acl a WHERE lower(a.user_email)=lower(session_user()) AND (a.company_code=opco OR a.company_code='ALL')))" "udf"

echo "== tag company_code columns"
for t in "${TABLES[@]}"; do
  run_sql "ALTER TABLE ${CATALOG}.${SCHEMA}.${t} ALTER COLUMN company_code SET TAGS ('opco'='')" "tag_${t}" || true
done

echo "== create ABAC policy"
run_sql "DROP POLICY IF EXISTS reliability_opco_row_filter ON SCHEMA ${CATALOG}.${SCHEMA}" "drop_policy" || true
run_sql "CREATE POLICY reliability_opco_row_filter ON SCHEMA ${CATALOG}.${SCHEMA} COMMENT 'ABAC OpCo row filter for columns tagged opco' ROW FILTER visible_opco TO \`account users\` EXCEPT \`${USER}\` FOR TABLES MATCH COLUMNS has_tag('opco') AS opco_col USING COLUMNS (opco_col)" "create_policy"

run_sql "SHOW POLICIES ON SCHEMA ${CATALOG}.${SCHEMA}" "show_policies"
echo "done"
