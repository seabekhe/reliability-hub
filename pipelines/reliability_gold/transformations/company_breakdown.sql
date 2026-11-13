CREATE OR REFRESH MATERIALIZED VIEW company_breakdown
COMMENT 'PD-area SAIDI / SAIFI this YTD vs prior year (Jan–Jul), per company'
WITH ROW FILTER serverless_sea202601_catalog.reliability_gold.visible_opco ON (company_code)
AS
WITH cust AS (
  SELECT company_code, pd_area, SUM(customers_served) AS n
  FROM silver_customers
  WHERE year = 2026
  GROUP BY company_code, pd_area
),
ytd AS (
  SELECT
    company_code,
    pd_area,
    YEAR(outage_date) AS yr,
    SUM(COALESCE(cmi, customers_interrupted * duration_min)) AS cmi,
    SUM(customers_interrupted) AS ci
  FROM silver_outages
  WHERE status = 'Reported'
    AND MONTH(outage_date) <= 7
  GROUP BY company_code, pd_area, YEAR(outage_date)
)
SELECT
  c.company_code,
  c.pd_area,
  ROUND(y26.cmi / c.n, 2) AS saidi_actual,
  ROUND(y25.cmi / c.n, 2) AS saidi_prior,
  ROUND(y26.ci / c.n, 3) AS saifi_actual,
  ROUND(y25.ci / c.n, 3) AS saifi_prior
FROM cust c
LEFT JOIN ytd y26 ON y26.company_code = c.company_code AND y26.pd_area = c.pd_area AND y26.yr = 2026
LEFT JOIN ytd y25 ON y25.company_code = c.company_code AND y25.pd_area = c.pd_area AND y25.yr = 2025
