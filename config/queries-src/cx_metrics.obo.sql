-- @param opco STRING
WITH cust AS (
  SELECT year, SUM(customers_served) AS n
  FROM serverless_sea202601_catalog.outage_source.customer_counts_oc1
  GROUP BY year
),
cust_2026 AS (
  SELECT n FROM cust WHERE year = 2026
),
cx AS (
  SELECT
    outage_date,
    YEAR(outage_date) AS yr,
    cmi,
    ci_sustained
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
  WHERE customer_experience = true
    AND :opco = 'OC1'
),
ytd AS (
  SELECT
    SUM(cmi) / MAX(c.n) AS avg_minutes_ytd,
    SUM(ci_sustained) / MAX(c.n) AS avg_count_ytd
  FROM cx
  CROSS JOIN cust_2026 c
  WHERE yr = 2026
),
hist AS (
  SELECT
    AVG(saidi) AS avg_minutes_7yr,
    AVG(saifi) AS avg_count_7yr
  FROM (
    SELECT
      cx.yr,
      SUM(cx.cmi) / MAX(c.n) AS saidi,
      SUM(cx.ci_sustained) / MAX(c.n) AS saifi
    FROM cx
    JOIN cust c ON c.year = cx.yr
    WHERE cx.yr < 2026
    GROUP BY cx.yr
  )
),
l12 AS (
  SELECT
    SUM(CASE WHEN outage_date BETWEEN DATE '2025-08-01' AND DATE '2026-07-31' THEN cmi ELSE 0 END)
      / MAX(c.n) AS avg_minutes_l12m,
    SUM(CASE WHEN outage_date BETWEEN DATE '2025-08-01' AND DATE '2026-07-31' THEN ci_sustained ELSE 0 END)
      / MAX(c.n) AS avg_count_l12m,
    SUM(CASE WHEN outage_date BETWEEN DATE '2024-08-01' AND DATE '2025-07-31' THEN cmi ELSE 0 END)
      / MAX(c.n) AS avg_minutes_p12m,
    SUM(CASE WHEN outage_date BETWEEN DATE '2024-08-01' AND DATE '2025-07-31' THEN ci_sustained ELSE 0 END)
      / MAX(c.n) AS avg_count_p12m
  FROM cx
  CROSS JOIN cust_2026 c
)
SELECT
  'OC1' AS company_code,
  ROUND(y.avg_minutes_ytd, 2) AS avg_minutes_ytd,
  ROUND(y.avg_minutes_ytd - h.avg_minutes_7yr, 2) AS avg_minutes_delta_7yr,
  ROUND(l.avg_minutes_l12m, 2) AS avg_minutes_l12m,
  ROUND(l.avg_minutes_l12m - l.avg_minutes_p12m, 2) AS avg_minutes_delta_12m,
  ROUND(y.avg_count_ytd, 3) AS avg_count_ytd,
  ROUND(y.avg_count_ytd - h.avg_count_7yr, 3) AS avg_count_delta_7yr,
  ROUND(l.avg_count_l12m, 3) AS avg_count_l12m,
  ROUND(l.avg_count_l12m - l.avg_count_p12m, 3) AS avg_count_delta_12m
FROM ytd y
CROSS JOIN hist h
CROSS JOIN l12 l
