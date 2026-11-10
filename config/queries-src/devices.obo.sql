-- @param opco STRING
-- @param dataset STRING
SELECT
  device_name AS device,
  'OC1' AS company_code,
  CASE
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 8 THEN 'Primary'
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 4 THEN 'Recurring'
    ELSE 'Watch'
  END AS flags,
  CASE
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 6 THEN 'Needs Review'
    ELSE 'Healthy'
  END AS status,
  CASE
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 8 THEN 'NSCHEEFF'
    ELSE 'X2SABEKH'
  END AS assignee,
  CASE
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 10 THEN 1
    WHEN SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) >= 6 THEN 2
    ELSE CAST(NULL AS INT)
  END AS priority,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  station_name AS substation,
  CAST(feeder_id AS INT) AS feeder_id,
  device_type,
  SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -30) THEN 1 ELSE 0 END) AS mo_1,
  SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -90) THEN 1 ELSE 0 END) AS mo_3,
  SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -180) THEN 1 ELSE 0 END) AS mo_6,
  SUM(CASE WHEN outage_date >= date_add(DATE '2026-07-31', -365) THEN 1 ELSE 0 END) AS mo_12,
  CAST(device_latitude AS DOUBLE) AS lat,
  CAST(device_longitude AS DOUBLE) AS lon
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
WHERE :opco = 'OC1'
  AND (
    (:dataset = 'CX' AND customer_experience = true)
    OR (:dataset <> 'CX' AND outage_category = 'Reported')
  )
GROUP BY device_name, device_type, pd_area_name, workgroup_name, station_name, feeder_id, device_latitude, device_longitude
ORDER BY mo_12 DESC
LIMIT 800
