-- Computer-vision findings: read JPEG bytes from the inspections volume and
-- score each unique image once with multimodal ai_query(files => content).
-- label_truth keeps the generator's planted label for demo comparison;
-- defect_type / severity / confidence / summary come from the model when
-- the call succeeds, otherwise fall back to the planted values.
CREATE OR REFRESH MATERIALIZED VIEW inspection_findings
COMMENT 'Asset-inspection CV findings. Multimodal ai_query over volume image bytes; falls back to planted labels on model error.'
AS
WITH scored AS (
  SELECT
    image_path,
    image_bytes,
    ai_query(
      'databricks-claude-sonnet-4-5',
      concat(
        'You are a distribution-line inspection vision model. ',
        'Inspect this field photo of utility equipment. ',
        'Reply with ONLY a JSON object (no markdown) with keys: ',
        'defect_type (one of: vegetation_encroachment, damaged_insulator, leaning_pole, conductor_damage, clear), ',
        'severity (integer 1-5), confidence (number between 0 and 1), ',
        'summary (one plain-text sentence describing what you see).'
      ),
      failOnError => false,
      files => content
    ) AS model_out
  FROM bronze_inspection_images
),
parsed AS (
  SELECT
    image_path,
    image_bytes,
    model_out.errorMessage AS model_error,
    -- failOnError => false returns STRUCT{result, errorMessage}. Strip optional markdown fences.
    get_json_object(raw_json, '$.defect_type') AS pred_defect_type,
    get_json_object(raw_json, '$.severity') AS pred_severity,
    get_json_object(raw_json, '$.confidence') AS pred_confidence,
    get_json_object(raw_json, '$.summary') AS pred_summary
  FROM (
    SELECT
      image_path,
      image_bytes,
      model_out,
      regexp_replace(
        CAST(model_out.result AS STRING),
        '(?s)^\\s*```(?:json)?\\s*|\\s*```\\s*$',
        ''
      ) AS raw_json
    FROM scored
  )
)
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
  COALESCE(
    CASE
      WHEN p.pred_defect_type IN (
        'vegetation_encroachment',
        'damaged_insulator',
        'leaning_pole',
        'conductor_damage',
        'clear'
      ) THEN p.pred_defect_type
    END,
    i.defect_type
  ) AS defect_type,
  COALESCE(
    CASE
      WHEN TRY_CAST(p.pred_severity AS INT) BETWEEN 1 AND 5
        THEN TRY_CAST(p.pred_severity AS INT)
    END,
    i.severity
  ) AS severity,
  COALESCE(
    CASE
      WHEN TRY_CAST(p.pred_confidence AS DOUBLE) BETWEEN 0 AND 1
        THEN TRY_CAST(p.pred_confidence AS DOUBLE)
    END,
    i.confidence
  ) AS confidence,
  COALESCE(NULLIF(TRIM(p.pred_summary), ''), i.summary) AS summary,
  i.label_truth,
  i.image_path,
  i.image_rel_path,
  i.thumbnail_data_url,
  i.image_credit,
  i.image_license,
  i.commons_title,
  CASE
    WHEN p.image_path IS NULL THEN 'missing_image'
    WHEN p.model_error IS NOT NULL THEN 'error'
    WHEN p.pred_defect_type IS NULL THEN 'error'
    ELSE 'ai_query'
  END AS model_status,
  p.image_bytes,
  p.model_error,
  CASE
    WHEN COALESCE(
      CASE
        WHEN p.pred_defect_type IN (
          'vegetation_encroachment',
          'damaged_insulator',
          'leaning_pole',
          'conductor_damage',
          'clear'
        ) THEN p.pred_defect_type
      END,
      i.defect_type
    ) = 'clear' THEN 'Clear'
    WHEN COALESCE(
      CASE
        WHEN TRY_CAST(p.pred_severity AS INT) BETWEEN 1 AND 5
          THEN TRY_CAST(p.pred_severity AS INT)
      END,
      i.severity
    ) >= 4 THEN 'Critical'
    WHEN COALESCE(
      CASE
        WHEN TRY_CAST(p.pred_severity AS INT) BETWEEN 1 AND 5
          THEN TRY_CAST(p.pred_severity AS INT)
      END,
      i.severity
    ) >= 3 THEN 'Elevated'
    ELSE 'Watch'
  END AS finding_status,
  COALESCE(d.mo_12, 0) AS device_mo_12,
  COALESCE(d.status, 'Unknown') AS device_status,
  current_timestamp() AS refreshed_at
FROM silver_inspections i
LEFT JOIN parsed p
  ON p.image_path = regexp_replace(i.image_path, '^dbfs:', '')
LEFT JOIN (
  SELECT company_code, device, MAX(mo_12) AS mo_12, MAX(status) AS status
  FROM devices
  WHERE dataset = 'Reported'
  GROUP BY company_code, device
) d
  ON d.company_code = i.company_code AND d.device = i.device
