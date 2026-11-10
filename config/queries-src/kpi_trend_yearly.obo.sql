-- @param opco STRING
WITH cust AS (
  SELECT year, SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  GROUP BY year
),
a AS (
  SELECT
    YEAR(o.outage_date) AS year,
    ROUND(SUM(o.cmi) / MAX(c.n), 2) AS actual_saidi,
    ROUND(SUM(o.ci_sustained) / MAX(c.n), 3) AS actual_saifi
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1 o
  JOIN cust c ON c.year = YEAR(o.outage_date)
  WHERE o.outage_category = 'Reported'
    AND :opco = 'OC1'
  GROUP BY YEAR(o.outage_date)
),
g AS (
  SELECT
    YEAR(date) AS year,
    ROUND(SUM(cmi_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365, 2) AS saidi_goal,
    ROUND(SUM(ci_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365, 3) AS saifi_goal
  FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1
  WHERE date IN (
    SELECT MAX(date) FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1 GROUP BY YEAR(date)
  )
  GROUP BY YEAR(date)
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
JOIN g ON g.year = a.year
ORDER BY a.year
