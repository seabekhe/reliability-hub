#!/usr/bin/env bash
# Create Lakebase SNAPSHOT synced tables for the hottest reliability_gold MVs.
# Requires OpCo security via ABAC (not table-level SET ROW FILTER).
set -euo pipefail
PROFILE="${1:-sea-ws}"
CATALOG="${CATALOG:-serverless_sea202601_catalog}"
OLTP_SCHEMA="${OLTP_SCHEMA:-reliability_hub_oltp}"
BRANCH="${BRANCH:-projects/reliability-hub/branches/production}"
PG_DB="${PG_DB:-databricks_postgres}"

create_one() {
  local name="$1"; shift
  local pk_json="$1"
  python3 - <<PY
import json
body={
  "spec":{
    "source_table_full_name":"${CATALOG}.reliability_gold.${name}",
    "primary_key_columns":json.loads('${pk_json}'),
    "scheduling_policy":"SNAPSHOT",
    "branch":"${BRANCH}",
    "postgres_database":"${PG_DB}",
    "create_database_objects_if_missing":True,
    "new_pipeline_spec":{
      "storage_catalog":"${CATALOG}",
      "storage_schema":"${OLTP_SCHEMA}",
    },
  }
}
open("/tmp/st.json","w").write(json.dumps(body))
print("${name}", "pk", '${pk_json}')
PY
  databricks postgres create-synced-table \
    "${CATALOG}.${OLTP_SCHEMA}.${name}" \
    --profile "$PROFILE" --no-wait --json @/tmp/st.json \
    || true
}

create_one kpi_ytd '["company_code","year"]'
create_one kpi_monthly '["company_code","dataset","year","month"]'
create_one company_breakdown '["company_code","pd_area"]'
create_one worst_performing_feeders '["company_code","feeder_id","dataset"]'
create_one feeder_briefs '["company_code","feeder_id"]'
create_one inspection_device_risk '["company_code","device"]'
create_one cx_metrics '["company_code"]'
create_one devices '["company_code","device","dataset"]'
# reliability_rankings: create after gold MV is DISTINCT on (company_code,pd_area,workgroup)
create_one reliability_rankings '["company_code","pd_area","workgroup"]'

echo "done — poll with: databricks postgres get-synced-table synced_tables/${CATALOG}.${OLTP_SCHEMA}.TABLE --profile ${PROFILE}"
