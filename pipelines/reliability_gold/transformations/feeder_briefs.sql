-- AI-generated briefs for the top 10 worst performing feeders (Reported dataset, since 2024).
-- The facts column is computed from silver_outages. The brief column is written by ai_query
-- from those facts only. Treat brief text as a draft for planner review, not a source of truth.
CREATE OR REFRESH MATERIALIZED VIEW feeder_briefs
COMMENT 'AI-generated brief per top-10 worst performing feeder (Reported, since 2024). Brief text is written by Claude (databricks-claude-sonnet-4-5) from the facts column only. Draft for planner review.'
AS
WITH anchor AS (
  SELECT MAX(start_ts) AS end_ts FROM silver_outages
),
events AS (
  SELECT * FROM silver_outages
  WHERE YEAR(start_ts) >= 2024 AND status = 'Reported'
),
system_avg AS (
  SELECT AVG(duration_min) AS sys_avg_min FROM events
),
feeder_stats AS (
  SELECT
    e.feeder_id,
    SUM(CASE WHEN e.start_ts >= add_months(a.end_ts, -12) THEN 1 ELSE 0 END) AS events_last_12m,
    SUM(CASE WHEN e.start_ts < add_months(a.end_ts, -12) AND e.start_ts >= add_months(a.end_ts, -24) THEN 1 ELSE 0 END) AS events_prior_12m,
    ROUND(AVG(e.duration_min), 0) AS avg_restore_min,
    ROUND(AVG(CASE WHEN e.customer_experience THEN 1.0 ELSE 0.0 END) * 100, 0) AS cx_share_pct
  FROM events e
  CROSS JOIN anchor a
  GROUP BY e.feeder_id
),
cause_counts AS (
  SELECT feeder_id, cause, COUNT(*) AS n
  FROM events
  GROUP BY feeder_id, cause
),
cause_ranked AS (
  SELECT
    feeder_id,
    cause,
    n,
    ROW_NUMBER() OVER (PARTITION BY feeder_id ORDER BY n DESC, cause) AS rn
  FROM cause_counts
),
causes AS (
  SELECT
    feeder_id,
    concat_ws('; ', collect_list(concat(cause, ' (', CAST(n AS STRING), ' events)'))) AS top_causes
  FROM cause_ranked
  WHERE rn <= 2
  GROUP BY feeder_id
),
top AS (
  SELECT
    w.company_code,
    w.feeder_id,
    w.pd_area,
    w.workgroup,
    w.substation,
    w.wpf_rank,
    w.saifi,
    w.saidi,
    w.si,
    w.customers_served,
    w.event_count,
    f.events_last_12m,
    f.events_prior_12m,
    f.avg_restore_min,
    f.cx_share_pct,
    c.top_causes,
    s.sys_avg_min
  FROM worst_performing_feeders w
  LEFT JOIN feeder_stats f ON f.feeder_id = w.feeder_id
  LEFT JOIN causes c ON c.feeder_id = w.feeder_id
  CROSS JOIN system_avg s
  WHERE w.dataset = 'Reported' AND w.wpf_rank <= 10
),
facts AS (
  SELECT
    *,
    concat(
      'Feeder ', CAST(feeder_id AS STRING), ' at ', substation, ' in ', pd_area, ' / ', workgroup, '. ',
      'WPF rank ', CAST(wpf_rank AS STRING), ' of the Reported dataset. ',
      'SAIFI ', CAST(saifi AS STRING), ', SAIDI ', CAST(saidi AS STRING), ', severity index ', CAST(si AS STRING), '. ',
      'Events since 2024: ', CAST(event_count AS STRING),
      '; last 12 months: ', CAST(COALESCE(events_last_12m, 0) AS STRING),
      '; prior 12 months: ', CAST(COALESCE(events_prior_12m, 0) AS STRING), '. ',
      'Average restoration ', CAST(COALESCE(avg_restore_min, 0) AS STRING),
      ' min versus system average ', CAST(ROUND(sys_avg_min, 0) AS STRING), ' min. ',
      'Customer experience events: ', CAST(COALESCE(cx_share_pct, 0) AS STRING), ' percent of events. ',
      'Top causes: ', COALESCE(top_causes, 'not available'), '.'
    ) AS facts
  FROM top
)
SELECT
  company_code,
  feeder_id,
  pd_area,
  workgroup,
  substation,
  wpf_rank,
  saifi,
  saidi,
  si,
  customers_served,
  event_count,
  events_last_12m,
  events_prior_12m,
  avg_restore_min,
  cx_share_pct,
  top_causes,
  facts,
  ai_query(
    'databricks-claude-sonnet-4-5',
    concat(
      'You write short operational briefs for utility reliability planners. ',
      'Use ONLY the facts below. Do not add causes, numbers, equipment, dates or recommendations that are not supported by the facts. ',
      'Write exactly three sentences: (1) what drives this feeder into the worst performing list, ',
      '(2) how its restoration time compares with the system average, ',
      '(3) one suggested first check for the planner, worded as a suggestion. ',
      'Plain text, no headings, no bullets. Facts: ',
      facts
    )
  ) AS brief,
  current_timestamp() AS generated_at
FROM facts
