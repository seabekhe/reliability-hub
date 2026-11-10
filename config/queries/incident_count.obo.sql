-- @param opco STRING
SELECT COUNT(*) AS incident_count
FROM serverless_sea202601_catalog.reliability_gold.incidents
WHERE company_code = :opco
  AND status <> 'Closed'
