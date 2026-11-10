CREATE OR REFRESH MATERIALIZED VIEW silver_feeder_customers
COMMENT 'Peak feeder customer count from bronze daily feeder census'
AS
SELECT
  TRY_CAST(feeder_id AS INT) AS feeder_id,
  MAX(customer_count) AS customers_served
FROM bronze_feeder_customers
WHERE feeder_id IS NOT NULL
GROUP BY TRY_CAST(feeder_id AS INT)
