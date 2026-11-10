-- @param status STRING
-- @param opco STRING
-- @param year STRING
-- One calendar year per request so the JSON result stays under AppKit's 1MB SSE cap.
-- Repeat counts are computed in the client from the full merged set.
SELECT
  incident_id,
  CASE WHEN customer_experience THEN 'PRI,RP' ELSE 'OMO' END AS tags,
  cmi_threat_level AS threat_level,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  station_name AS substation,
  CAST(feeder_id AS INT) AS feeder_id,
  device_type,
  device_name AS device,
  cause_description AS cause,
  CASE
    WHEN outage_category = 'CX' THEN 'CX'
    WHEN outage_category = 'Scheduled' THEN 'Closed'
    ELSE 'Reported'
  END AS status,
  date_format(start_time_local, 'yyyy-MM-dd HH:mm') AS start_time,
  CAST(duration_minutes AS INT) AS duration_min,
  CAST(ci_sustained AS INT) AS ci_sustained,
  CAST(ci_sustained AS INT) * CAST(duration_minutes AS INT) AS cmi,
  CAST(device_latitude AS DOUBLE) AS lat,
  CAST(device_longitude AS DOUBLE) AS lon
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
WHERE :opco = 'OC1'
  AND year(start_time_local) = CAST(:year AS INT)
  AND (
    :status = ''
    OR CASE
      WHEN outage_category = 'CX' THEN 'CX'
      WHEN outage_category = 'Scheduled' THEN 'Closed'
      ELSE 'Reported'
    END = :status
  )
ORDER BY start_time_local DESC
