CREATE OR REFRESH MATERIALIZED VIEW incidents
COMMENT 'Gold incident fact used by the Lakebase app Incidents page'
CLUSTER BY (start_ts, pd_area)
WITH ROW FILTER serverless_sea202601_catalog.reliability_gold.visible_opco ON (company_code)
AS
SELECT
  incident_id,
  company_code,
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
  start_ts,
  duration_min,
  customers_interrupted,
  customers_momentary,
  cmi,
  lat,
  lon,
  outage_category,
  customer_experience
FROM silver_outages
