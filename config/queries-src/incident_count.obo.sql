-- @param opco STRING
SELECT COUNT(*) AS incident_count
FROM serverless_sea202601_catalog.outage_source.outage_detail_oc1
WHERE :opco = 'OC1'
  AND outage_category <> 'Scheduled'
