-- @param opco STRING
SELECT
  company_code,
  device,
  device_type,
  pd_area,
  workgroup,
  substation,
  feeder_id,
  lat,
  lon,
  inspection_count,
  open_findings,
  critical_findings,
  max_severity,
  last_inspected_at,
  latest_defect,
  device_mo_12,
  device_status,
  risk_score,
  risk_band
FROM serverless_sea202601_catalog.reliability_gold.inspection_device_risk
WHERE company_code = :opco
ORDER BY risk_score DESC
LIMIT 400
