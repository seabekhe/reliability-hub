-- @param opco STRING
-- @param dataset STRING
-- dataset is Reported (regulatory) or CX, matching goals_daily_* columns.
SELECT
  year,
  month,
  ROUND(saidi, 2) AS saidi,
  ROUND(saifi, 3) AS saifi,
  ROUND(cpi, 1) AS cpi
FROM serverless_sea202601_catalog.reliability_gold.kpi_monthly
WHERE company_code = :opco
  AND dataset = :dataset
ORDER BY year, month
