-- @param opco STRING
SELECT
  r.workgroup,
  r.pd_area,
  r.overall_rank,
  r.saidi,
  r.saifi,
  r.cemi10,
  r.customers_served,
  b.lat,
  b.lon,
  b.geojson,
  MAX(r.overall_rank) OVER () AS rank_max
FROM serverless_sea202601_catalog.reliability_gold.reliability_rankings r
LEFT JOIN serverless_sea202601_catalog.reliability_gold.workgroup_boundaries b
  ON b.workgroup = r.workgroup
 AND b.pd_area = r.pd_area
 AND b.company_code = r.company_code
WHERE r.company_code = :opco
ORDER BY r.overall_rank
