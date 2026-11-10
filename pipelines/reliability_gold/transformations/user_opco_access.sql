CREATE OR REFRESH MATERIALIZED VIEW user_opco_access
COMMENT 'Demo OpCo access list used by optional gold-path entitlements'
AS
SELECT * FROM VALUES
  ('exec.demo@omedutilities.com', 'ALL', 'executive'),
  ('exec.demo@omedutilities.com', 'OC1', 'executive'),
  ('exec.demo@omedutilities.com', 'OC2', 'executive'),
  ('exec.demo@omedutilities.com', 'OC3', 'executive'),
  ('ops.oc1@omedutilities.com', 'OC1', 'operator')
AS t(user_email, company_code, role)
