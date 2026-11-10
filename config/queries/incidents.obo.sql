-- @param status STRING
-- @param opco STRING
-- @param year STRING
-- One calendar year per request so the JSON result stays under AppKit's 1MB SSE cap.
-- Repeat counts are computed in the client from the full merged set.
SELECT
  incident_id,
  tags,
  threat_level,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  device_type,
  device,
  cause,
  status,
  date_format(start_ts, 'yyyy-MM-dd HH:mm') AS start_time,
  duration_min,
  customers_interrupted AS ci_sustained,
  customers_interrupted * duration_min AS cmi,
  lat,
  lon
FROM serverless_sea202601_catalog.reliability_gold.incidents
WHERE company_code = :opco
  AND year(start_ts) = CAST(:year AS INT)
  AND (:status = '' OR status = :status)
ORDER BY start_ts DESC
