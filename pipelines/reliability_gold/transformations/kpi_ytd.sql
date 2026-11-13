CREATE OR REFRESH MATERIALIZED VIEW kpi_ytd
COMMENT 'Year-to-date SAIDI / SAIFI vs goal with year-end projection and funding'
WITH ROW FILTER serverless_sea202601_catalog.reliability_gold.visible_opco ON (company_code)
AS
SELECT
  m.company_code,
  ROUND(SUM(m.saidi), 2) AS saidi_actual,
  ROUND(SUM(m.saifi), 3) AS saifi_actual,
  ROUND(AVG(m.cpi), 1) AS cpi_actual,
  g.year,
  g.saidi_goal,
  g.saifi_goal,
  ROUND(SUM(m.saidi) / 7 * 12, 2) AS saidi_ye_proj,
  ROUND(SUM(m.saifi) / 7 * 12, 3) AS saifi_ye_proj,
  GREATEST(0, LEAST(200, ROUND((2.0 - (SUM(m.saidi) / 7 * 12) / NULLIF(g.saidi_goal, 0)) * 100, 0))) AS saidi_funding_pct,
  GREATEST(0, LEAST(200, ROUND((2.0 - (SUM(m.saifi) / 7 * 12) / NULLIF(g.saifi_goal, 0)) * 100, 0))) AS saifi_funding_pct
FROM kpi_monthly m
JOIN kpi_goals g
  ON g.company_code = m.company_code
 AND g.year = 2026
WHERE m.year = 2026
  AND m.dataset = 'Reported'
GROUP BY m.company_code, g.year, g.saidi_goal, g.saifi_goal
