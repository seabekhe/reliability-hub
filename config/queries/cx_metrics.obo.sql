-- @param opco STRING
SELECT
  company_code,
  avg_minutes_ytd,
  avg_minutes_delta_7yr,
  avg_minutes_l12m,
  avg_minutes_delta_12m,
  avg_count_ytd,
  avg_count_delta_7yr,
  avg_count_l12m,
  avg_count_delta_12m
FROM serverless_sea202601_catalog.reliability_gold.cx_metrics
WHERE company_code = :opco
