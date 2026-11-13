-- OpCo row filter for Reliability Hub gold tables.
-- Applied with: ALTER MATERIALIZED VIEW … SET ROW FILTER visible_opco ON (company_code)
-- or WITH ROW FILTER visible_opco ON (company_code) on CREATE OR REFRESH.
--
-- Access is granted when ANY of:
--   1. Account group reliability-exec-all (all OpCos)
--   2. Account group reliability-opco-oc{N} for that OpCo
--   3. A row in user_opco_access (pipeline-seeded demo users)
--   4. A row in user_opco_acl (workspace overrides; not in git — see scripts/apply_visible_opco.sql)
--
-- Parameter is named `opco` (not `company_code`) so it does not shadow
-- a.company_code inside the EXISTS subqueries.
--
-- App :opco parameters remain a UX selector within the caller's allowed OpCos.
-- Genie and ad-hoc SQL inherit the same filter via OBO / session_user().

CREATE OR REPLACE FUNCTION serverless_sea202601_catalog.reliability_gold.visible_opco(opco STRING)
RETURNS BOOLEAN
COMMENT 'UC row filter: caller may see this OpCo row'
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
