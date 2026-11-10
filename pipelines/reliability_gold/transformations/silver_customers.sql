CREATE OR REFRESH MATERIALIZED VIEW silver_customers
COMMENT 'Annual customer counts by company / PD area / workgroup from bronze'
AS
SELECT
  company_code,
  year,
  pd_area_name AS pd_area,
  workgroup_name AS workgroup,
  CAST(customers_served AS BIGINT) AS customers_served
FROM bronze_customers
WHERE year IS NOT NULL
