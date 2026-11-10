-- @param status STRING
-- @param opco STRING
-- Uncapped KPI totals for the selected status. The incidents table still shows
-- the 1,500 most recent rows.
WITH scoped AS (
  SELECT
    CASE
      WHEN outage_category = 'CX' THEN 'CX'
      WHEN outage_category = 'Scheduled' THEN 'Closed'
      ELSE 'Reported'
    END AS status,
    CAST(ci_sustained AS INT) AS ci_sustained,
    CAST(duration_minutes AS INT) AS duration_min,
    cmi_threat_level AS threat_level
  FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
  WHERE :opco = 'OC1'
)
SELECT
  COUNT(*) AS incident_count,
  COALESCE(SUM(ci_sustained), 0) AS ci_sustained,
  COALESCE(SUM(ci_sustained * duration_min), 0) AS cmi,
  SUM(CASE WHEN threat_level IN ('Enhanced', 'Moderate') THEN 1 ELSE 0 END) AS severe
FROM scoped
WHERE (:status = '' OR status = :status)
