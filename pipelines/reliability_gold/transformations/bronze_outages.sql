CREATE OR REFRESH STREAMING TABLE bronze_outages
COMMENT 'Bronze outages for all companies via Auto Loader from reliability_gold.raw volume'
AS
SELECT
  *,
  current_timestamp() AS _ingested_at,
  _metadata.file_path AS _source_file
FROM STREAM read_files(
  '/Volumes/serverless_sea202601_catalog/reliability_gold/raw/outage_detail',
  format => 'parquet',
  schemaEvolutionMode => 'rescue'
)
