CREATE OR REFRESH MATERIALIZED VIEW kpi_goals
COMMENT 'Annual SAIDI / SAIFI goals per company (demo defaults matching generate_medallion.py GOALS)'
AS
SELECT * FROM VALUES
  ('OC1', 2026, 74.2, 0.592),
  ('OC2', 2026, 81.5, 0.710),
  ('OC3', 2026, 62.0, 0.540)
AS t(company_code, year, saidi_goal, saifi_goal)
