-- OpCo visibility UDF used by the ABAC row-filter policy
-- (reliability_gold.reliability_opco_row_filter), NOT by table-level SET ROW FILTER.
--
-- Access is granted when ANY of:
--   1. Account group reliability-exec-all (all OpCos)
--   2. Account group reliability-opco-oc{N} for that OpCo
--   3. A row in user_opco_access (pipeline-seeded demo users)
--   4. A row in user_opco_acl (workspace overrides; see scripts/apply_opco_abac.sql)
--
-- Parameter is named `opco` so it does not shadow a.company_code in EXISTS.
-- Apply / re-apply with: scripts/apply_opco_abac.sql

CREATE OR REPLACE FUNCTION serverless_sea202601_catalog.reliability_gold.visible_opco(opco STRING)
RETURNS BOOLEAN
COMMENT 'ABAC OpCo visibility UDF — used by policy reliability_opco_row_filter'
RETURN (
  is_account_group_member('reliability-exec-all')
  OR (
    opco = 'OC1'
    AND is_account_group_member('reliability-opco-oc1')
  )
  OR (
    opco = 'OC2'
    AND is_account_group_member('reliability-opco-oc2')
  )
  OR (
    opco = 'OC3'
    AND is_account_group_member('reliability-opco-oc3')
  )
  OR EXISTS (
    SELECT 1
    FROM serverless_sea202601_catalog.reliability_gold.user_opco_access a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
  OR EXISTS (
    SELECT 1
    FROM serverless_sea202601_catalog.reliability_gold.user_opco_acl a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
);
