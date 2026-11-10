-- @param opco STRING
SELECT
  company_code,
  saidi_actual,
  saifi_actual,
  cpi_actual,
  year,
  saidi_goal,
  saifi_goal,
  saidi_ye_proj,
  saifi_ye_proj,
  saidi_funding_pct,
  saifi_funding_pct
FROM serverless_sea202601_catalog.reliability_gold.kpi_ytd
WHERE company_code = :opco
