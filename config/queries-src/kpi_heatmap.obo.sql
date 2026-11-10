-- @param opco STRING
-- @param dataset STRING
WITH cust AS (
  SELECT year, SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  GROUP BY year
)
SELECT
  YEAR(o.outage_date) AS year,
  MONTH(o.outage_date) AS month,
  ROUND(SUM(o.cmi) / MAX(c.n), 2) AS saidi,
  ROUND(SUM(o.ci_sustained) / MAX(c.n), 3) AS saifi,
  ROUND(SUM(o.ci_sustained) / NULLIF(COUNT(*), 0), 1) AS cpi
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1 o
JOIN cust c ON c.year = YEAR(o.outage_date)
WHERE :opco = 'OC1'
  AND (
    (:dataset = 'CX' AND o.customer_experience = true)
    OR (:dataset <> 'CX' AND o.outage_category = 'Reported')
  )
GROUP BY YEAR(o.outage_date), MONTH(o.outage_date)
ORDER BY year, month
