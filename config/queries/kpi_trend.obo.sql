-- @param opco STRING
WITH m AS (
  SELECT month, saidi, saifi
  FROM serverless_sea202601_catalog.reliability_gold.kpi_monthly
  WHERE year = 2026
    AND dataset = 'Reported'
    AND company_code = :opco
),
g AS (
  SELECT saidi_goal, saifi_goal
  FROM serverless_sea202601_catalog.reliability_gold.kpi_ytd
  WHERE company_code = :opco
)
SELECT
  m.month,
  date_format(make_date(2026, m.month, 1), 'MMM') AS month_label,
  ROUND(SUM(m.saidi) OVER (ORDER BY m.month), 2) AS actual_saidi,
  ROUND(g.saidi_goal / 12 * m.month, 2) AS goal_saidi,
  ROUND(g.saidi_goal / 12 * m.month * 1.65, 2) AS band0_saidi,
  ROUND(g.saidi_goal / 12 * m.month * 0.5, 2) AS band200_saidi,
  ROUND(SUM(m.saifi) OVER (ORDER BY m.month), 3) AS actual_saifi,
  ROUND(g.saifi_goal / 12 * m.month, 3) AS goal_saifi,
  ROUND(g.saifi_goal / 12 * m.month * 1.65, 3) AS band0_saifi,
  ROUND(g.saifi_goal / 12 * m.month * 0.5, 3) AS band200_saifi
FROM m
CROSS JOIN g
ORDER BY m.month
