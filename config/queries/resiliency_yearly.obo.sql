-- @param opco STRING
SELECT
  CAST(year AS STRING) AS year_label,
  pct_0h AS `Within 1 hour`,
  pct_2h AS `Within 2 hours`,
  pct_10h AS `Within 10 hours`,
  pct_total,
  ci_per_incident AS `Customers interrupted per incident`
FROM serverless_sea202601_catalog.reliability_gold.resiliency_yearly
WHERE company_code = :opco
ORDER BY year
