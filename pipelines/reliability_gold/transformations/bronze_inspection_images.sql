-- Field inspection JPEGs landed under the inspections volume.
-- binaryFile reads the actual image bytes (not just path metadata) so
-- downstream findings can call multimodal ai_query(files => content).
CREATE OR REFRESH MATERIALIZED VIEW bronze_inspection_images
COMMENT 'Inspection photo bytes from reliability_gold.inspections (JPEG/PNG via read_files binaryFile)'
AS
SELECT
  regexp_replace(path, '^dbfs:', '') AS image_path,
  path AS path_raw,
  length AS image_bytes,
  modificationTime AS modified_at,
  content
FROM read_files(
  '/Volumes/serverless_sea202601_catalog/reliability_gold/inspections',
  format => 'binaryFile',
  recursiveFileLookup => true,
  fileNamePattern => '*.{jpg,jpeg,png,JPG,JPEG,PNG}'
)
