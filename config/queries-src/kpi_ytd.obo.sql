-- @param opco STRING
-- Company SAIDI/SAIFI YTD from Reported outages; annual goals from goals_daily.
-- Funding % is not in the 25-table contract — returned NULL for a Coming soon slot.
WITH cust AS (
  SELECT SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  WHERE year = 2026
),
actuals AS (
  SELECT
    ROUND(SUM(o.cmi) / MAX(c.n), 2) AS saidi_actual,
    ROUND(SUM(o.ci_sustained) / MAX(c.n), 3) AS saifi_actual,
    ROUND(SUM(o.ci_sustained) / NULLIF(COUNT(*), 0), 1) AS cpi_actual
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1 o
  CROSS JOIN cust c
  WHERE o.outage_category = 'Reported'
    AND YEAR(o.outage_date) = 2026
    AND :opco = 'OC1'
),
goals AS (
  SELECT
    ROUND(SUM(cmi_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365, 2) AS saidi_goal,
    ROUND(SUM(ci_daily_goal) / NULLIF(SUM(number_of_customers), 0) * 365, 3) AS saifi_goal
  FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1
  WHERE date = (SELECT MAX(date) FROM serverless_sea202601_catalog.outage_source.goals_daily_oc1 WHERE YEAR(date) = 2026)
)
SELECT
  'OC1' AS company_code,
  a.saidi_actual,
  a.saifi_actual,
  a.cpi_actual,
  2026 AS year,
  g.saidi_goal,
  g.saifi_goal,
  ROUND(a.saidi_actual / 7 * 12, 2) AS saidi_ye_proj,
  ROUND(a.saifi_actual / 7 * 12, 3) AS saifi_ye_proj,
  CAST(NULL AS DOUBLE) AS saidi_funding_pct,
  CAST(NULL AS DOUBLE) AS saifi_funding_pct
FROM actuals a
CROSS JOIN goals g
