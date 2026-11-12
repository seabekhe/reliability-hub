CREATE OR REFRESH MATERIALIZED VIEW inspection_device_risk
COMMENT 'Per-device inspection risk: open findings rolled up against trailing incident counts'
AS
WITH findings AS (
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
    COUNT(*) AS inspection_count,
    SUM(CASE WHEN defect_type <> 'clear' THEN 1 ELSE 0 END) AS open_findings,
    SUM(CASE WHEN severity >= 4 AND defect_type <> 'clear' THEN 1 ELSE 0 END) AS critical_findings,
    MAX(severity) AS max_severity,
    MAX(captured_at) AS last_inspected_at,
    MAX_BY(defect_type, captured_at) AS latest_defect
  FROM inspection_findings
  GROUP BY company_code, device, device_type, pd_area, workgroup, substation, feeder_id, lat, lon
)
SELECT
  f.*,
  COALESCE(d.mo_12, 0) AS device_mo_12,
  COALESCE(d.status, 'Unknown') AS device_status,
  -- Simple demo score: critical findings weigh more than volume of inspections.
  ROUND(
    COALESCE(d.mo_12, 0) * 0.4
      + f.critical_findings * 12
      + f.open_findings * 4
      + COALESCE(f.max_severity, 0) * 1.5,
    1
  ) AS risk_score,
  CASE
    WHEN f.critical_findings > 0 OR COALESCE(d.mo_12, 0) >= 8 THEN 'High'
    WHEN f.open_findings > 0 OR COALESCE(d.mo_12, 0) >= 4 THEN 'Medium'
    ELSE 'Low'
  END AS risk_band
FROM findings f
LEFT JOIN (
  SELECT company_code, device, MAX(mo_12) AS mo_12, MAX(status) AS status
  FROM devices
  WHERE dataset = 'Reported'
  GROUP BY company_code, device
) d
  ON d.company_code = f.company_code AND d.device = f.device
