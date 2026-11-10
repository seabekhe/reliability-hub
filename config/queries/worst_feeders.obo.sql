-- @param opco STRING
-- @param dataset STRING
SELECT
  wpf_rank,
  company_code,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  customers_served,
  ci,
  saifi,
  cmi,
  saidi,
  si,
  cpi,
  event_count
FROM serverless_sea202601_catalog.reliability_gold.worst_performing_feeders
WHERE company_code = :opco
  AND dataset = :dataset
ORDER BY si DESC
LIMIT 200
