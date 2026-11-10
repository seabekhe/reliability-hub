-- @param opco STRING
-- @param dataset STRING
SELECT
  device,
  company_code,
  flags,
  status,
  assignee,
  priority,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  device_type,
  mo_1,
  mo_3,
  mo_6,
  mo_12,
  lat,
  lon
FROM serverless_sea202601_catalog.reliability_gold.devices
WHERE company_code = :opco
  AND dataset = :dataset
ORDER BY mo_12 DESC
LIMIT 800
