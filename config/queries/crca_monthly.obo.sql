-- @param opco STRING
-- Customers restored within N hours, by month. The client turns these into
-- YTD and rolling-12-month CRCA ratios for any threshold.
SELECT
  year(start_ts) AS year,
  month(start_ts) AS month,
  SUM(customers_interrupted) AS ci_total,
  SUM(CASE WHEN duration_min <= 120 THEN customers_interrupted ELSE 0 END) AS ci_2h,
  SUM(CASE WHEN duration_min <= 180 THEN customers_interrupted ELSE 0 END) AS ci_3h,
  SUM(CASE WHEN duration_min <= 240 THEN customers_interrupted ELSE 0 END) AS ci_4h,
  SUM(CASE WHEN duration_min <= 300 THEN customers_interrupted ELSE 0 END) AS ci_5h,
  SUM(CASE WHEN duration_min <= 360 THEN customers_interrupted ELSE 0 END) AS ci_6h
FROM serverless_sea202601_catalog.reliability_gold.incidents
WHERE company_code = :opco
GROUP BY 1, 2
ORDER BY 1, 2
