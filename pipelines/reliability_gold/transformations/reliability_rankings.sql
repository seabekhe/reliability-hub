CREATE OR REFRESH MATERIALIZED VIEW reliability_rankings
COMMENT 'Workgroup reliability ranks for the latest window'
AS
SELECT
  company_code,
  pd_area,
  workgroup,
  customers_served,
  customers_interrupted,
  cmi,
  saifi,
  saidi,
  saifi_rank,
  saidi_rank,
  overall_rank,
  demi4,
  cemi10_customers,
  cemi10
FROM silver_rankings
