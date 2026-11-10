-- @param opco STRING
WITH cust AS (
  SELECT SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  WHERE year = 2026
),
m AS (
  SELECT
    MONTH(o.outage_date) AS month,
    SUM(o.cmi) / MAX(c.n) AS saidi,
    SUM(o.ci_sustained) / MAX(c.n) AS saifi
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1 o
  CROSS JOIN cust c
  WHERE o.outage_category = 'Reported'
    AND YEAR(o.outage_date) = 2026
    AND :opco = 'OC1'
  GROUP BY MONTH(o.outage_date)
),
g AS (
  SELECT
    SUM(cmi_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365 AS saidi_goal,
    SUM(ci_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365 AS saifi_goal
  FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1
  WHERE date = (SELECT MAX(date) FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1 WHERE YEAR(date) = 2026)
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
