CREATE OR REFRESH MATERIALIZED VIEW silver_outages
COMMENT 'Cleaned outages for all companies from bronze Auto Loader ingest'
CLUSTER BY (outage_date, pd_area)
AS
SELECT
  incident_id,
  company_code,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  station_name AS substation,
  TRY_CAST(feeder_id AS INT) AS feeder_id,
  device_type,
  device_name AS device,
  cause_description AS cause,
  start_time_local AS start_ts,
  outage_date,
  CASE
    WHEN outage_category = 'CX' THEN 'CX'
    WHEN outage_category = 'Scheduled' THEN 'Closed'
    ELSE 'Reported'
  END AS status,
  cmi_threat_level AS threat_level,
  CASE WHEN customer_experience THEN 'PRI,RP' ELSE 'OMO' END AS tags,
  CAST(duration_minutes AS INT) AS duration_min,
  CAST(ci_sustained AS INT) AS customers_interrupted,
  CAST(ci_momentary AS INT) AS customers_momentary,
  CAST(device_latitude AS DOUBLE) AS lat,
  CAST(device_longitude AS DOUBLE) AS lon,
  outage_category,
  customer_experience,
  cmi
FROM bronze_outages
WHERE incident_id IS NOT NULL
  AND outage_date IS NOT NULL
