# Reliability gold Lakeflow pipeline

End-to-end path for the Lakebase app:

```
outage_source  →  Volume landing (Parquet)  →  bronze_* (Auto Loader ST)
     (source UC)            reliability_gold.raw              → silver_* → reliability_gold marts
                                                              → Reliability Hub OBO SQL + Lakebase
```

Triggered serverless Spark Declarative Pipeline, refreshed on a schedule by
job `reliability-gold-daily` (06:00 America/Chicago): seed landing → pipeline update.

## First run

1. Ensure volume exists: `serverless_sea202601_catalog.reliability_gold.raw`
2. Deploy the bundle, seed landing once, then full-refresh the pipeline:

```bash
databricks bundle deploy --profile sea-ws
databricks bundle run reliability_gold_daily --profile sea-ws
```

Or seed + pipeline separately:

```bash
databricks bundle run reliability_gold_daily --profile sea-ws   # seeds then refreshes
# pipeline-only after files already landed:
databricks bundle run reliability_gold --profile sea-ws
```

If older `generate_gold.py` Delta tables still occupy gold names, drop them
first (materialized views cannot replace plain Delta of the same name):

```sql
DROP TABLE IF EXISTS serverless_sea202601_catalog.reliability_gold.incidents;
-- …same for the other gold marts listed previously
```

Do **not** full-refresh unless you intend to recompute every table from files.
Selective refresh is enough after a single-file SQL edit.
