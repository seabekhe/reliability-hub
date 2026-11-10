-- @param opco STRING
SELECT
  company_code,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  account_no,
  meter_no,
  meter_nos,
  address,
  total_incidents,
  total_duration,
  last_incident,
  lat,
  lon
FROM serverless_sea202601_catalog.reliability_gold.customer_incidents
WHERE company_code = :opco
ORDER BY total_incidents DESC
LIMIT 800
