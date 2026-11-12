CREATE OR REFRESH STREAMING TABLE bronze_inspections
COMMENT 'Bronze asset-inspection events for all companies via Auto Loader from reliability_gold.raw volume'
AS
SELECT
  *,
  current_timestamp() AS _ingested_at,
  _metadata.file_path AS _source_file
FROM STREAM read_files(
  '/Volumes/serverless_sea202601_catalog/reliability_gold/raw/inspection_events',
  format => 'parquet',
  schemaEvolutionMode => 'rescue'
)
