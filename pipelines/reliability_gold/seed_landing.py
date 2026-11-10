# Databricks notebook source
# MAGIC %md
# MAGIC # Seed Auto Loader landing zone
# MAGIC
# MAGIC Exports the source tables used by `reliability-gold` into
# MAGIC `/Volumes/serverless_sea202601_catalog/reliability_gold/raw/<table>/load_dt=<date>/`
# MAGIC as Parquet. Each landing table unions the per-company source tables
# MAGIC (`<table>_oc1`, `<table>_oc2`, `<table>_oc3`) so Auto Loader sees all companies.
# MAGIC Each run writes a new `load_dt` folder so Auto Loader picks up files.

# COMMAND ----------

dbutils.widgets.text("source_catalog", "serverless_sea202601_catalog")
dbutils.widgets.text("source_schema", "outage_source")
dbutils.widgets.text("landing_volume", "/Volumes/serverless_sea202601_catalog/reliability_gold/raw")
dbutils.widgets.text("load_dt", "")

source_catalog = dbutils.widgets.get("source_catalog")
source_schema = dbutils.widgets.get("source_schema")
landing_volume = dbutils.widgets.get("landing_volume").rstrip("/")
load_dt = dbutils.widgets.get("load_dt").strip() or spark.sql("SELECT date_format(current_date(), 'yyyy-MM-dd')").collect()[0][0]

SRC = f"{source_catalog}.{source_schema}"

# Landing tables the bronze Auto Loader paths expect. Keep in sync with bronze_*.sql.
TABLES = [
    "outage_detail",
    "customer_counts",
    "customer_counts_daily",
    "rankings_workgroup",
    "outage_customer_detail",
]
# Per-company source tables are named <table>_<company suffix>.
COMPANY_SUFFIXES = ["oc1", "oc2", "oc3"]

# COMMAND ----------

for table in TABLES:
    combined = None
    for suffix in COMPANY_SUFFIXES:
        part = spark.table(f"{SRC}.{table}_{suffix}")
        combined = part if combined is None else combined.unionByName(part)
    dest = f"{landing_volume}/{table}/load_dt={load_dt}"
    (
        combined.write.mode("overwrite")
        .option("compression", "snappy")
        .parquet(dest)
    )
    n = spark.read.parquet(dest).count()
    print(f"Wrote {n:,} rows → {dest}")

print(f"\nLanding seed complete for load_dt={load_dt}")
