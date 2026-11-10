-- @param status STRING
-- @param opco STRING
SELECT
  COUNT(*) AS incident_count,
  COALESCE(SUM(customers_interrupted), 0) AS ci_sustained,
  COALESCE(SUM(customers_interrupted * duration_min), 0) AS cmi,
  SUM(CASE WHEN threat_level IN ('Enhanced', 'Moderate') THEN 1 ELSE 0 END) AS severe
FROM serverless_sea202601_catalog.reliability_gold.incidents
WHERE company_code = :opco
  AND (:status = '' OR status = :status)
