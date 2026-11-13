-- Demo seed for the UC row filter visible_opco (see security/visible_opco.sql).
-- Real workspace testers are granted via user_opco_acl (scripts/apply_visible_opco.sql),
-- not by putting personal emails in this file.
CREATE OR REFRESH MATERIALIZED VIEW user_opco_access
COMMENT 'Demo OpCo ACL rows consumed by reliability_gold.visible_opco row filter'
AS
SELECT * FROM VALUES
  ('exec.demo@omedutilities.com', 'ALL', 'executive'),
  ('exec.demo@omedutilities.com', 'OC1', 'executive'),
  ('exec.demo@omedutilities.com', 'OC2', 'executive'),
  ('exec.demo@omedutilities.com', 'OC3', 'executive'),
  ('ops.oc1@omedutilities.com', 'OC1', 'operator')
AS t(user_email, company_code, role)
