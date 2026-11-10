CREATE OR REFRESH MATERIALIZED VIEW silver_customer_accounts
COMMENT 'Customer-level outage facts rolled to account + address from bronze'
AS
SELECT
  company_code,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  station_name AS substation,
  TRY_CAST(feeder_id AS INT) AS feeder_id,
  TRY_CAST(account_num AS BIGINT) AS account_num,
  service_address AS address,
  CONCAT_WS(',', COLLECT_SET(CAST(meter_number AS STRING))) AS meter_nos,
  TRY_CAST(MIN(meter_number) AS INT) AS meter_no,
  COUNT(*) AS total_incidents,
  CAST(SUM(cmi) AS INT) AS total_duration,
  date_format(MAX(record_timestamp_utc), 'yyyy-MM-dd') AS last_incident,
  CAST(latitude AS DOUBLE) AS lat,
  CAST(longitude AS DOUBLE) AS lon
FROM bronze_customer_accounts
GROUP BY
  company_code,
  account_num,
  service_address,
  pd_area_name,
  workgroup_name,
  station_name,
  TRY_CAST(feeder_id AS INT),
  latitude,
  longitude
