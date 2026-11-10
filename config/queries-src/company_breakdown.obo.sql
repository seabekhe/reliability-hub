-- @param opco STRING
WITH cust AS (
  SELECT pd_area_name, SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  WHERE year = 2026
  GROUP BY pd_area_name
),
ytd AS (
  SELECT
    pd_area_name,
    YEAR(outage_date) AS yr,
    SUM(cmi) AS cmi,
    SUM(ci_sustained) AS ci
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
  WHERE outage_category = 'Reported'
    AND MONTH(outage_date) <= 7
    AND :opco = 'OC1'
  GROUP BY pd_area_name, YEAR(outage_date)
)
SELECT
  'OC1' AS company_code,
  c.pd_area_name AS pd_area,
  ROUND(y26.cmi / c.n, 2) AS saidi_actual,
  ROUND(y25.cmi / c.n, 2) AS saidi_prior,
  ROUND(y26.ci / c.n, 3) AS saifi_actual,
  ROUND(y25.ci / c.n, 3) AS saifi_prior
FROM cust c
LEFT JOIN ytd y26 ON y26.pd_area_name = c.pd_area_name AND y26.yr = 2026
LEFT JOIN ytd y25 ON y25.pd_area_name = c.pd_area_name AND y25.yr = 2025
ORDER BY pd_area
