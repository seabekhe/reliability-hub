-- Apply OpCo row security via Unity Catalog ABAC (not table-level SET ROW FILTER).
-- Table-level row filters block Lakebase synced tables; ABAC policies do not.
--
-- Prerequisites:
--   CREATE GOVERNED TAG opco;   -- account-level, once per account
--
-- Safe to re-run. EXCEPT lists the runner (session_user) so pipeline refresh /
-- admin work is not permanently filtered into MVs.

USE CATALOG serverless_sea202601_catalog;
USE SCHEMA reliability_gold;

-- Workspace / tester overrides (pipeline MV user_opco_access stays demo-only).
CREATE TABLE IF NOT EXISTS user_opco_acl (
  user_email STRING NOT NULL,
  company_code STRING NOT NULL,
  role STRING,
  granted_at TIMESTAMP
) USING DELTA;

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

CREATE OR REPLACE FUNCTION visible_opco(opco STRING)
RETURNS BOOLEAN
COMMENT 'ABAC OpCo visibility UDF — used by policy reliability_opco_row_filter'
RETURN (
  is_account_group_member('reliability-exec-all')
  OR (opco = 'OC1' AND is_account_group_member('reliability-opco-oc1'))
  OR (opco = 'OC2' AND is_account_group_member('reliability-opco-oc2'))
  OR (opco = 'OC3' AND is_account_group_member('reliability-opco-oc3'))
  OR EXISTS (
    SELECT 1 FROM user_opco_access a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
  OR EXISTS (
    SELECT 1 FROM user_opco_acl a
    WHERE lower(a.user_email) = lower(session_user())
      AND (a.company_code = opco OR a.company_code = 'ALL')
  )
);

-- Drop legacy table-level filters if any remain (they block synced tables).
-- Run per table as needed; ignore errors if already dropped.

-- Tag company_code columns so the schema policy matches them.
-- (Re-tag is idempotent.)
ALTER TABLE company_breakdown ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE customer_incidents ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE cx_metrics ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE devices ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE feeder_briefs ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE incidents ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE inspection_device_risk ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE inspection_findings ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE kpi_goals ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE kpi_monthly ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE kpi_ytd ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE reliability_rankings ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE resiliency_yearly ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE restoration_program ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE workgroup_boundaries ALTER COLUMN company_code SET TAGS ('opco' = '');
ALTER TABLE worst_performing_feeders ALTER COLUMN company_code SET TAGS ('opco' = '');

-- Schema-scoped ABAC policy. Prefer scripts/apply_opco_abac.sh so EXCEPT is
-- injected as the current session_user (pipeline owner / apply runner).
-- Manual apply: DROP then CREATE with EXCEPT `you@example.com`.
DROP POLICY IF EXISTS reliability_opco_row_filter ON SCHEMA reliability_gold;

-- CREATE POLICY reliability_opco_row_filter
-- ON SCHEMA reliability_gold
-- COMMENT 'ABAC OpCo row filter for columns tagged opco'
-- ROW FILTER visible_opco
-- TO `account users`
-- EXCEPT `PIPELINE_OWNER@example.com`
-- FOR TABLES
-- MATCH COLUMNS has_tag('opco') AS opco_col
-- USING COLUMNS (opco_col);

SHOW POLICIES ON SCHEMA reliability_gold;
