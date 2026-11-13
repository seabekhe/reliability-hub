CREATE OR REFRESH MATERIALIZED VIEW worst_performing_feeders
COMMENT 'Feeders ranked by severity index (SAIDI × SAIFI) since 2024'
AS
WITH agg AS (
  SELECT
    company_code,
    pd_area,
    workgroup,
    substation,
    feeder_id,
    dataset,
    SUM(customers_interrupted) AS ci,
    SUM(COALESCE(cmi, customers_interrupted * duration_min)) AS cmi,
    COUNT(*) AS event_count
  FROM (
    SELECT *, 'Reported' AS dataset
    FROM silver_outages
    WHERE YEAR(start_ts) >= 2024 AND status = 'Reported'
    UNION ALL
    SELECT *, 'CX' AS dataset
    FROM silver_outages
    WHERE YEAR(start_ts) >= 2024 AND (status = 'CX' OR customer_experience)
  ) src
  GROUP BY company_code, pd_area, workgroup, substation, feeder_id, dataset
)
SELECT
  RANK() OVER (PARTITION BY a.company_code, a.dataset ORDER BY ROUND(a.cmi / NULLIF(f.customers_served, 0), 1) * ROUND(a.ci / NULLIF(f.customers_served, 0), 3) DESC) AS wpf_rank,
  a.company_code,
  a.pd_area,
  a.workgroup,
  a.substation,
  a.feeder_id,
  f.customers_served,
  a.ci,
  ROUND(a.ci / NULLIF(f.customers_served, 0), 3) AS saifi,
  a.cmi,
  ROUND(a.cmi / NULLIF(f.customers_served, 0), 1) AS saidi,
  ROUND(
    ROUND(a.cmi / NULLIF(f.customers_served, 0), 1)
    * ROUND(a.ci / NULLIF(f.customers_served, 0), 3),
    2
  ) AS si,
  ROUND(a.ci / NULLIF(a.event_count, 0), 1) AS cpi,
  a.event_count,
  a.dataset
FROM agg a
JOIN silver_feeder_customers f ON f.feeder_id = a.feeder_id
