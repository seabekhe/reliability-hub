-- @param opco STRING
WITH a AS (
  SELECT
    year,
    ROUND(SUM(saidi), 2) AS actual_saidi,
    ROUND(SUM(saifi), 3) AS actual_saifi
  FROM serverless_sea202601_catalog.reliability_gold.kpi_monthly
  WHERE dataset = 'Reported'
    AND company_code = :opco
  GROUP BY year
)
SELECT
  CAST(a.year AS STRING) AS period_label,
  a.actual_saidi,
  ROUND(g.saidi_goal, 2) AS goal_saidi,
  ROUND(g.saidi_goal * 1.65, 2) AS band0_saidi,
  ROUND(g.saidi_goal * 0.5, 2) AS band200_saidi,
  a.actual_saifi,
  ROUND(g.saifi_goal, 3) AS goal_saifi,
  ROUND(g.saifi_goal * 1.65, 3) AS band0_saifi,
  ROUND(g.saifi_goal * 0.5, 3) AS band200_saifi
FROM a
JOIN serverless_sea202601_catalog.reliability_gold.kpi_goals g
  ON g.year = a.year
 AND g.company_code = :opco
ORDER BY a.year
