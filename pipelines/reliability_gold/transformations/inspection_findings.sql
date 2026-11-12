-- Pre-baked computer-vision findings for the Inspections page.
-- Findings are labeled in generate_inspections.py (model_status = 'stubbed').
-- To go live later, replace the stubbed summary/defect_type with ai_query(... files => ...) over image bytes.
CREATE OR REFRESH MATERIALIZED VIEW inspection_findings
COMMENT 'Asset-inspection CV findings (mock imagery + pre-baked labels). model_status=stubbed until multimodal ai_query is wired.'
AS
SELECT
  i.inspection_id,
  i.company_code,
  i.device,
  i.device_type,
  i.pd_area,
  i.workgroup,
  i.substation,
  i.feeder_id,
  i.lat,
  i.lon,
  i.captured_at,
  i.source,
  i.defect_type,
  i.severity,
  i.confidence,
  i.summary,
  i.label_truth,
  i.image_path,
  i.image_rel_path,
  i.thumbnail_data_url,
  i.image_credit,
  i.image_license,
  i.commons_title,
  i.model_status,
  CASE
    WHEN i.defect_type = 'clear' THEN 'Clear'
    WHEN i.severity >= 4 THEN 'Critical'
    WHEN i.severity >= 3 THEN 'Elevated'
    ELSE 'Watch'
  END AS finding_status,
  COALESCE(d.mo_12, 0) AS device_mo_12,
  COALESCE(d.status, 'Unknown') AS device_status,
  current_timestamp() AS refreshed_at
FROM silver_inspections i
LEFT JOIN (
  SELECT company_code, device, MAX(mo_12) AS mo_12, MAX(status) AS status
  FROM devices
  WHERE dataset = 'Reported'
  GROUP BY company_code, device
) d
  ON d.company_code = i.company_code AND d.device = i.device
