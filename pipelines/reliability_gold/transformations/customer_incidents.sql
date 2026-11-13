CREATE OR REFRESH MATERIALIZED VIEW customer_incidents
COMMENT 'Repeat customer outages for the Customer incidents page'
WITH ROW FILTER serverless_sea202601_catalog.reliability_gold.visible_opco ON (company_code)
AS
SELECT
  company_code,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  account_num AS account_no,
  meter_no,
  meter_nos,
  address,
  total_incidents,
  total_duration,
  last_incident,
  lat,
  lon
FROM silver_customer_accounts
