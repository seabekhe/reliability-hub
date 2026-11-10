-- @param opco STRING
SELECT
  CAST(YEAR(outage_date) AS STRING) AS year_label,
  ROUND(SUM(CASE WHEN duration_minutes <= 60 THEN ci_sustained ELSE 0 END) / NULLIF(SUM(ci_sustained), 0) * 100, 1) AS `Within 1 hour`,
  ROUND(SUM(CASE WHEN duration_minutes <= 120 THEN ci_sustained ELSE 0 END) / NULLIF(SUM(ci_sustained), 0) * 100, 1) AS `Within 2 hours`,
  ROUND(SUM(CASE WHEN duration_minutes <= 600 THEN ci_sustained ELSE 0 END) / NULLIF(SUM(ci_sustained), 0) * 100, 1) AS `Within 10 hours`,
  100.0 AS pct_total,
  ROUND(SUM(ci_sustained) / NULLIF(COUNT(*), 0), 1) AS `Customers interrupted per incident`
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
WHERE :opco = 'OC1'
  AND outage_category = 'Reported'
GROUP BY YEAR(outage_date)
ORDER BY YEAR(outage_date)
