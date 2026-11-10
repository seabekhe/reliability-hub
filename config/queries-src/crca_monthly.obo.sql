-- @param opco STRING
SELECT
  YEAR(outage_date) AS year,
  MONTH(outage_date) AS month,
  SUM(ci_sustained) AS ci_total,
  SUM(CASE WHEN duration_minutes <= 120 THEN ci_sustained ELSE 0 END) AS ci_2h,
  SUM(CASE WHEN duration_minutes <= 180 THEN ci_sustained ELSE 0 END) AS ci_3h,
  SUM(CASE WHEN duration_minutes <= 240 THEN ci_sustained ELSE 0 END) AS ci_4h,
  SUM(CASE WHEN duration_minutes <= 300 THEN ci_sustained ELSE 0 END) AS ci_5h,
  SUM(CASE WHEN duration_minutes <= 360 THEN ci_sustained ELSE 0 END) AS ci_6h
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
WHERE :opco = 'OC1'
GROUP BY YEAR(outage_date), MONTH(outage_date)
ORDER BY 1, 2
