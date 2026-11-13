CREATE OR REFRESH MATERIALIZED VIEW workgroup_boundaries
COMMENT 'Workgroup map centroids. geojson is null — no polygon source in outage_source'
AS
SELECT
  r.company_code,
  r.pd_area,
  r.workgroup,
  c.lat,
  c.lon,
  r.customers_served,
  CAST(NULL AS STRING) AS geojson
FROM silver_rankings r
LEFT JOIN (
  SELECT pd_area, workgroup, AVG(lat) AS lat, AVG(lon) AS lon
  FROM silver_outages
  GROUP BY pd_area, workgroup
) c
  ON c.pd_area = r.pd_area
 AND c.workgroup = r.workgroup
