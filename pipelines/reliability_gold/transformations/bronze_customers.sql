CREATE OR REFRESH STREAMING TABLE bronze_customers
COMMENT 'Bronze annual customer counts via Auto Loader'
AS
SELECT
  *,
  current_timestamp() AS _ingested_at,
  _metadata.file_path AS _source_file
FROM STREAM read_files(
  '/Volumes/serverless_sea202601_catalog/reliability_gold/raw/customer_counts',
  format => 'parquet',
  schemaEvolutionMode => 'rescue'
)
