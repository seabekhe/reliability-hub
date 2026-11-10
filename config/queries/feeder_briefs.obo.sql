-- @param opco STRING
SELECT
  wpf_rank,
  feeder_id,
  pd_area,
  workgroup,
  substation,
  saifi,
  saidi,
  si,
  event_count,
  events_last_12m,
  events_prior_12m,
  avg_restore_min,
  cx_share_pct,
  top_causes,
  brief,
  generated_at
FROM serverless_sea202601_catalog.reliability_gold.feeder_briefs
WHERE company_code = :opco
ORDER BY wpf_rank
LIMIT 20
