CREATE OR REFRESH MATERIALIZED VIEW kpi_monthly
COMMENT 'Monthly SAIDI / SAIFI / CPI by company and dataset'
WITH ROW FILTER serverless_sea202601_catalog.reliability_gold.visible_opco ON (company_code)
AS
WITH company AS (
  SELECT company_code, SUM(customers_served) AS n
  FROM silver_customers
  WHERE year = 2026
  GROUP BY company_code
),
reported AS (
  SELECT company_code, YEAR(start_ts) AS year, MONTH(start_ts) AS month, 'Reported' AS dataset,
    SUM(customers_interrupted) AS ci,
    SUM(COALESCE(cmi, customers_interrupted * duration_min)) AS cmi,
    COUNT(*) AS events
  FROM silver_outages
  WHERE outage_category = 'Reported'
  GROUP BY company_code, YEAR(start_ts), MONTH(start_ts)
),
cx AS (
  SELECT company_code, YEAR(start_ts) AS year, MONTH(start_ts) AS month, 'CX' AS dataset,
    SUM(customers_interrupted) AS ci,
    SUM(COALESCE(cmi, customers_interrupted * duration_min)) AS cmi,
    COUNT(*) AS events
  FROM silver_outages
  WHERE customer_experience
  GROUP BY company_code, YEAR(start_ts), MONTH(start_ts)
),
all_ds AS (
  SELECT company_code, YEAR(start_ts) AS year, MONTH(start_ts) AS month, 'All' AS dataset,
    SUM(customers_interrupted) AS ci,
    SUM(COALESCE(cmi, customers_interrupted * duration_min)) AS cmi,
    COUNT(*) AS events
  FROM silver_outages
  WHERE outage_category <> 'Scheduled'
  GROUP BY company_code, YEAR(start_ts), MONTH(start_ts)
)
SELECT
  m.company_code,
  m.dataset,
  m.year,
  m.month,
  ROUND(m.cmi / c.n, 3) AS saidi,
  ROUND(m.ci / c.n, 4) AS saifi,
  ROUND(m.ci / NULLIF(m.events, 0), 2) AS cpi
FROM (
  SELECT * FROM reported
  UNION ALL
  SELECT * FROM cx
  UNION ALL
  SELECT * FROM all_ds
) m
JOIN company c ON c.company_code = m.company_code
