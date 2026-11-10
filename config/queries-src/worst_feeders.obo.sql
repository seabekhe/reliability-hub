-- @param opco STRING
-- @param dataset STRING
WITH feeder_cust AS (
  SELECT CAST(feeder_id AS INT) AS feeder_id, MAX(customer_count) AS customers_served
  FROM serverless_sea202601_catalog.outage_source.customer_counts_daily_oc1
  GROUP BY CAST(feeder_id AS INT)
),
agg AS (
  SELECT
    o.pd_area_name AS pd_area,
    o.workgroup_name AS workgroup,
    o.station_name AS substation,
    CAST(o.feeder_id AS INT) AS feeder_id,
    SUM(o.ci_sustained) AS ci,
    SUM(o.cmi) AS cmi,
    COUNT(*) AS event_count
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1 o
  WHERE :opco = 'OC1'
    AND YEAR(o.outage_date) >= 2024
    AND (
      (:dataset = 'CX' AND o.customer_experience = true)
      OR (:dataset <> 'CX' AND o.outage_category = 'Reported')
    )
  GROUP BY o.pd_area_name, o.workgroup_name, o.station_name, CAST(o.feeder_id AS INT)
)
SELECT
  RANK() OVER (ORDER BY ROUND(a.cmi / NULLIF(c.customers_served, 0), 1) * ROUND(a.ci / NULLIF(c.customers_served, 0), 3) DESC) AS wpf_rank,
  'OC1' AS company_code,
  a.pd_area,
  a.workgroup,
  a.substation,
  a.feeder_id,
  c.customers_served,
  a.ci,
  ROUND(a.ci / NULLIF(c.customers_served, 0), 3) AS saifi,
  a.cmi,
  ROUND(a.cmi / NULLIF(c.customers_served, 0), 1) AS saidi,
  ROUND(
    ROUND(a.cmi / NULLIF(c.customers_served, 0), 1)
    * ROUND(a.ci / NULLIF(c.customers_served, 0), 3),
    2
  ) AS si,
  ROUND(a.ci / NULLIF(a.event_count, 0), 1) AS cpi,
  a.event_count
FROM agg a
JOIN feeder_cust c ON c.feeder_id = a.feeder_id
ORDER BY si DESC
LIMIT 200
