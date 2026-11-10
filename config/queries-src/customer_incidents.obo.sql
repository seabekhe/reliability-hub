-- @param opco STRING
SELECT
  'OC1' AS company_code,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  station_name AS substation,
  CAST(feeder_id AS INT) AS feeder_id,
  CAST(account_num AS BIGINT) AS account_no,
  CAST(MIN(meter_number) AS INT) AS meter_no,
  CONCAT_WS(',', COLLECT_SET(CAST(meter_number AS STRING))) AS meter_nos,
  service_address AS address,
  COUNT(*) AS total_incidents,
  CAST(SUM(cmi) AS INT) AS total_duration,
  date_format(MAX(record_timestamp_utc), 'yyyy-MM-dd') AS last_incident,
  CAST(latitude AS DOUBLE) AS lat,
  CAST(longitude AS DOUBLE) AS lon
FROM serverless_sea202601_catalog.outage_source.outage_customer_detail_oc1
WHERE :opco = 'OC1'
GROUP BY account_num, service_address, pd_area_name, workgroup_name, station_name, feeder_id, latitude, longitude
ORDER BY total_incidents DESC
LIMIT 800
