-- @param opco STRING
SELECT
  company_code,
  overall_rank,
  pd_area,
  workgroup,
  customers_served,
  customers_interrupted,
  cmi,
  saifi,
  saifi_rank,
  saidi,
  saidi_rank,
  demi4,
  cemi10_customers,
  cemi10
FROM serverless_sea202601_catalog.reliability_gold.reliability_rankings
WHERE company_code = :opco
ORDER BY overall_rank
