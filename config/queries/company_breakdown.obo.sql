-- @param opco STRING
SELECT
  company_code,
  pd_area,
  saidi_actual,
  saidi_prior,
  saifi_actual,
  saifi_prior
FROM serverless_sea202601_catalog.reliability_gold.company_breakdown
WHERE company_code = :opco
ORDER BY company_code, pd_area
