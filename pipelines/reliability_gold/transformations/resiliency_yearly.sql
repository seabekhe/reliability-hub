CREATE OR REFRESH MATERIALIZED VIEW resiliency_yearly
COMMENT 'Share of CI restored within 1 / 2 / 10 hours by year'
AS
SELECT
  company_code,
  YEAR(outage_date) AS year,
  ROUND(SUM(CASE WHEN duration_min <= 60 THEN customers_interrupted ELSE 0 END) / NULLIF(SUM(customers_interrupted), 0) * 100, 1) AS pct_0h,
  ROUND(SUM(CASE WHEN duration_min <= 120 THEN customers_interrupted ELSE 0 END) / NULLIF(SUM(customers_interrupted), 0) * 100, 1) AS pct_2h,
  ROUND(SUM(CASE WHEN duration_min <= 600 THEN customers_interrupted ELSE 0 END) / NULLIF(SUM(customers_interrupted), 0) * 100, 1) AS pct_10h,
  100.0 AS pct_total,
  ROUND(SUM(customers_interrupted) / NULLIF(COUNT(*), 0), 1) AS ci_per_incident
FROM silver_outages
WHERE status = 'Reported'
GROUP BY company_code, YEAR(outage_date)
