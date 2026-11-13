CREATE OR REFRESH MATERIALIZED VIEW devices
COMMENT 'Protective devices ranked by incidents in trailing windows'
AS
WITH as_of AS (
  SELECT DATE '2026-07-31' AS d
),
agg AS (
  SELECT
    company_code,
    device,
    device_type,
    pd_area,
    workgroup,
    substation,
    feeder_id,
    lat,
    lon,
    dataset,
    SUM(CASE WHEN outage_date >= DATE_ADD(a.d, -30) THEN 1 ELSE 0 END) AS mo_1,
    SUM(CASE WHEN outage_date >= DATE_ADD(a.d, -90) THEN 1 ELSE 0 END) AS mo_3,
    SUM(CASE WHEN outage_date >= DATE_ADD(a.d, -180) THEN 1 ELSE 0 END) AS mo_6,
    SUM(CASE WHEN outage_date >= DATE_ADD(a.d, -365) THEN 1 ELSE 0 END) AS mo_12
  FROM (
    SELECT company_code, device, device_type, pd_area, workgroup, substation, feeder_id, lat, lon, outage_date, 'Reported' AS dataset
    FROM silver_outages
    WHERE outage_category = 'Reported'
    UNION ALL
    SELECT company_code, device, device_type, pd_area, workgroup, substation, feeder_id, lat, lon, outage_date, 'CX'
    FROM silver_outages
    WHERE customer_experience
  ) src
  CROSS JOIN as_of a
  GROUP BY company_code, device, device_type, pd_area, workgroup, substation, feeder_id, lat, lon, dataset
)
SELECT
  device,
  company_code,
  CASE WHEN mo_12 >= 8 THEN 'Primary' WHEN mo_12 >= 4 THEN 'Recurring' ELSE 'Watch' END AS flags,
  CASE WHEN mo_12 >= 6 THEN 'Needs Review' ELSE 'Healthy' END AS status,
  CASE WHEN mo_12 >= 8 THEN 'NSCHEEFF' ELSE 'X2SABEKH' END AS assignee,
  CASE WHEN mo_12 >= 10 THEN 1 WHEN mo_12 >= 6 THEN 2 ELSE CAST(NULL AS INT) END AS priority,
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
  lon,
  dataset
FROM agg
