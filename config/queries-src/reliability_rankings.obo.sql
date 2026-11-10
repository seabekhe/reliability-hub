-- @param opco STRING
SELECT
  'OC1' AS company_code,
  overall_rank,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  customers_served,
  CAST(ci_sustained AS INT) AS customers_interrupted,
  CAST(cmi AS BIGINT) AS cmi,
  saifi,
  saifi_rank,
  saidi,
  saidi_rank,
  demi4_per_device_reported AS demi4,
  CAST(cemi4_reported AS INT) AS cemi10_customers,
  ROUND(cemi4_per_customer_reported * 100, 2) AS cemi10
FROM serverless_sea202601_catalog.outage_source.rankings_workgroup_oc1
WHERE :opco = 'OC1'
ORDER BY overall_rank
