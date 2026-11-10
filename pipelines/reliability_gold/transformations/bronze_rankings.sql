CREATE OR REFRESH STREAMING TABLE bronze_rankings
COMMENT 'Bronze workgroup rankings via Auto Loader'
AS
SELECT
  *,
  current_timestamp() AS _ingested_at,
  _metadata.file_path AS _source_file
FROM STREAM read_files(
  '/Volumes/serverless_sea202601_catalog/reliability_gold/raw/rankings_workgroup',
  format => 'parquet',
  schemaEvolutionMode => 'rescue'
)
