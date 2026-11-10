-- @param opco STRING
-- Centroids from device locations. geojson is NULL — polygons are not in the 25 tables.
WITH centroids AS (
  SELECT
    pd_area_name,
    workgroup_name,
    AVG(CAST(device_latitude AS DOUBLE)) AS lat,
    AVG(CAST(device_longitude AS DOUBLE)) AS lon
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
  GROUP BY pd_area_name, workgroup_name
)
SELECT
  r.workgroup_name AS workgroup,
  r.pd_area_name AS pd_area,
  r.overall_rank,
  r.saidi,
  r.saifi,
  ROUND(r.cemi4_per_customer_reported * 100, 2) AS cemi10,
  r.customers_served,
  b.lat,
  b.lon,
  CAST(NULL AS STRING) AS geojson,
  MAX(r.overall_rank) OVER () AS rank_max
FROM serverless_sea202601_catalog.outage_source.rankings_workgroup_oc1 r
LEFT JOIN centroids b
  ON b.workgroup_name = r.workgroup_name
 AND b.pd_area_name = r.pd_area_name
WHERE :opco = 'OC1'
ORDER BY r.overall_rank
