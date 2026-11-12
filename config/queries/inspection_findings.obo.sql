-- @param opco STRING
SELECT
  inspection_id,
  company_code,
  device,
  device_type,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  lat,
  lon,
  captured_at,
  source,
  defect_type,
  severity,
  confidence,
  summary,
  label_truth,
  image_rel_path,
  thumbnail_data_url,
  image_credit,
  image_license,
  commons_title,
  model_status,
  finding_status,
  device_mo_12,
  device_status
FROM serverless_sea202601_catalog.reliability_gold.inspection_findings
WHERE company_code = :opco
ORDER BY severity DESC, captured_at DESC
LIMIT 400
