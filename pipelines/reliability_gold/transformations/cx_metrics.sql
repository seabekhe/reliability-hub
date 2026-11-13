CREATE OR REFRESH MATERIALIZED VIEW cx_metrics
COMMENT 'Customer-experience SAIDI / SAIFI vs 7-year and trailing 12 months, per company'
AS
WITH cust AS (
  SELECT company_code, year, SUM(customers_served) AS n
  FROM silver_customers
  GROUP BY company_code, year
),
cust_2026 AS (
  SELECT company_code, n FROM cust WHERE year = 2026
),
cx AS (
  SELECT company_code, outage_date, YEAR(outage_date) AS yr, COALESCE(cmi, customers_interrupted * duration_min) AS cmi, customers_interrupted AS ci_sustained
  FROM silver_outages
  WHERE customer_experience
),
ytd AS (
  SELECT
    cx.company_code,
    SUM(cx.cmi) / MAX(c.n) AS avg_minutes_ytd,
    SUM(cx.ci_sustained) / MAX(c.n) AS avg_count_ytd
  FROM cx
  JOIN cust_2026 c ON c.company_code = cx.company_code
  WHERE cx.yr = 2026
  GROUP BY cx.company_code
),
hist AS (
  SELECT
    company_code,
    AVG(saidi) AS avg_minutes_7yr,
    AVG(saifi) AS avg_count_7yr
  FROM (
    SELECT
      cx.company_code,
      cx.yr,
      SUM(cx.cmi) / MAX(c.n) AS saidi,
      SUM(cx.ci_sustained) / MAX(c.n) AS saifi
    FROM cx
    JOIN cust c ON c.company_code = cx.company_code AND c.year = cx.yr
    WHERE cx.yr < 2026
    GROUP BY cx.company_code, cx.yr
  )
  GROUP BY company_code
),
l12 AS (
  SELECT
    cx.company_code,
    SUM(CASE WHEN cx.outage_date BETWEEN DATE '2025-08-01' AND DATE '2026-07-31' THEN cx.cmi ELSE 0 END) / MAX(c.n) AS avg_minutes_l12m,
    SUM(CASE WHEN cx.outage_date BETWEEN DATE '2025-08-01' AND DATE '2026-07-31' THEN cx.ci_sustained ELSE 0 END) / MAX(c.n) AS avg_count_l12m,
    SUM(CASE WHEN cx.outage_date BETWEEN DATE '2024-08-01' AND DATE '2025-07-31' THEN cx.cmi ELSE 0 END) / MAX(c.n) AS avg_minutes_p12m,
    SUM(CASE WHEN cx.outage_date BETWEEN DATE '2024-08-01' AND DATE '2025-07-31' THEN cx.ci_sustained ELSE 0 END) / MAX(c.n) AS avg_count_p12m
  FROM cx
  JOIN cust_2026 c ON c.company_code = cx.company_code
  GROUP BY cx.company_code
)
SELECT
  y.company_code,
  ROUND(y.avg_minutes_ytd, 2) AS avg_minutes_ytd,
  ROUND(y.avg_minutes_ytd - h.avg_minutes_7yr, 2) AS avg_minutes_delta_7yr,
  ROUND(l.avg_minutes_l12m, 2) AS avg_minutes_l12m,
  ROUND(l.avg_minutes_l12m - l.avg_minutes_p12m, 2) AS avg_minutes_delta_12m,
  ROUND(y.avg_count_ytd, 3) AS avg_count_ytd,
  ROUND(y.avg_count_ytd - h.avg_count_7yr, 3) AS avg_count_delta_7yr,
  ROUND(l.avg_count_l12m, 3) AS avg_count_l12m,
  ROUND(l.avg_count_l12m - l.avg_count_p12m, 3) AS avg_count_delta_12m
FROM ytd y
LEFT JOIN hist h ON h.company_code = y.company_code
JOIN l12 l ON l.company_code = y.company_code
