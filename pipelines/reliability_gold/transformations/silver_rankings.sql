CREATE OR REFRESH MATERIALIZED VIEW silver_rankings
COMMENT 'Latest workgroup ranking window from bronze'
AS
SELECT
  company_code,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  customers_served,
  CAST(ci_sustained AS INT) AS customers_interrupted,
  CAST(cmi AS BIGINT) AS cmi,
  saifi,
  saidi,
  saifi_rank,
  saidi_rank,
  overall_rank,
  demi4_per_device_reported AS demi4,
  CAST(cemi4_reported AS INT) AS cemi10_customers,
  ROUND(cemi4_per_customer_reported * 100, 2) AS cemi10,
  window_start,
  window_end
FROM bronze_rankings
WHERE window_end = (
  SELECT MAX(window_end)
  FROM bronze_rankings
)
