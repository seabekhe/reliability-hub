CREATE OR REFRESH MATERIALIZED VIEW silver_inspections
COMMENT 'Cleaned asset-inspection events (pre-baked CV findings; model stubbed)'
CLUSTER BY (company_code, captured_at)
AS
SELECT
  inspection_id,
  company_code,
  device,
  device_type,
  pd_area,
  workgroup,
  substation,
  TRY_CAST(feeder_id AS INT) AS feeder_id,
  CAST(lat AS DOUBLE) AS lat,
  CAST(lon AS DOUBLE) AS lon,
  CAST(captured_at AS TIMESTAMP) AS captured_at,
  source,
  defect_type,
  CAST(severity AS INT) AS severity,
  CAST(confidence AS DOUBLE) AS confidence,
  summary,
  label_truth,
  image_path,
  image_rel_path,
  thumbnail_data_url,
  image_credit,
  image_license,
  commons_title,
  COALESCE(model_status, 'stubbed') AS model_status
FROM bronze_inspections
WHERE inspection_id IS NOT NULL
  AND company_code IS NOT NULL
