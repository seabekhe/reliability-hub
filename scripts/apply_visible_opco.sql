-- Apply OpCo row filters at the Unity Catalog data layer.
-- Run on the sea-ws SQL warehouse after the reliability-gold pipeline has published
-- the consumer gold materialized views. Safe to re-run.
--
-- Does NOT put personal emails in git: the ACL override table is seeded with
-- session_user() of whoever runs this script (plus optional demo rows).

USE CATALOG serverless_sea202601_catalog;
USE SCHEMA reliability_gold;

-- Workspace / tester overrides (pipeline MV user_opco_access stays demo-only).
CREATE TABLE IF NOT EXISTS user_opco_acl (
  user_email STRING NOT NULL,
  company_code STRING NOT NULL,
  role STRING,
  granted_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;

-- Grant the runner executive access so local/workspace verification works.
MERGE INTO user_opco_acl AS t
USING (
  SELECT lower(session_user()) AS user_email, company_code, role
  FROM VALUES
    ('ALL', 'executive'),
    ('OC1', 'executive'),
    ('OC2', 'executive'),
    ('OC3', 'executive')
    AS v(company_code, role)
) AS s
ON lower(t.user_email) = s.user_email AND t.company_code = s.company_code
WHEN NOT MATCHED THEN INSERT (user_email, company_code, role, granted_at)
  VALUES (s.user_email, s.company_code, s.role, current_timestamp());

-- Recreate the filter function (source of truth also in pipelines/.../security/).
-- Parameter is `opco` so it does not shadow a.company_code in the EXISTS clauses.
CREATE OR REPLACE FUNCTION visible_opco(opco STRING)
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
    FROM user_opco_access a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
  OR EXISTS (
    SELECT 1
    FROM user_opco_acl a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
);

-- Consumer gold MVs queried by the app / Genie (not bronze/silver internals).
ALTER MATERIALIZED VIEW company_breakdown
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW customer_incidents
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW cx_metrics
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW devices
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW feeder_briefs
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW incidents
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW inspection_device_risk
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW inspection_findings
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW kpi_goals
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW kpi_monthly
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW kpi_ytd
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW reliability_rankings
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW resiliency_yearly
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW restoration_program
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW workgroup_boundaries
  SET ROW FILTER visible_opco ON (company_code);
ALTER MATERIALIZED VIEW worst_performing_feeders
  SET ROW FILTER visible_opco ON (company_code);

-- Confirm
SELECT table_name, filter_name, target_columns
FROM information_schema.row_filters
WHERE table_schema = 'reliability_gold'
ORDER BY table_name;
