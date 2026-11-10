"""Rebuild reliability_gold marts from outage_source (real-shaped source)."""
from __future__ import annotations

import hashlib
import json
import math
from datetime import date

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CAT = "serverless_sea202601_catalog"
SRC = f"{CAT}.outage_source"
AS_OF = date(2026, 7, 31)
spark = SparkSession.builder.getOrCreate()


def h01(s: str) -> float:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def polygon_ring(lat: float, lon: float, seed: str, radius_deg: float = 0.18):
    ring = []
    for i in range(8):
        a = (2 * math.pi * i / 8) + h01(f"{seed}-rot") * 0.4
        stretch = 0.75 + h01(f"{seed}-{i}") * 0.5
        ring.append([
            round(lon + math.cos(a) * radius_deg * stretch * 1.15, 5),
            round(lat + math.sin(a) * radius_deg * stretch, 5),
        ])
    ring.append(ring[0])
    return ring


src_inc = spark.table(f"{SRC}.outage_detail_oc1").select(
    F.col("incident_id").cast("bigint").alias("incident_id"),
    F.lit("OC1").alias("company_code"),
    F.col("pd_area_name").alias("pd_area"),
    F.col("workgroup_name").alias("workgroup"),
    F.col("station_name").alias("substation"),
    F.col("feeder_id").cast("int").alias("feeder_id"),
    "device_type",
    F.col("device_name").alias("device"),
    F.col("cause_description").alias("cause"),
    F.col("start_time_local").alias("start_ts"),
    F.when(F.col("outage_category") == "CX", "CX")
    .when(F.col("outage_category") == "Scheduled", "Closed")
    .otherwise("Reported")
    .alias("status"),
    F.col("cmi_threat_level").alias("threat_level"),
    F.when(F.col("customer_experience"), F.lit("PRI,RP")).otherwise(F.lit("OMO")).alias("tags"),
    F.col("duration_minutes").cast("int").alias("duration_min"),
    F.col("ci_sustained").cast("int").alias("customers_interrupted"),
    F.col("ci_momentary").cast("int").alias("customers_momentary"),
    F.col("device_latitude").cast("double").alias("lat"),
    F.col("device_longitude").cast("double").alias("lon"),
    F.col("phase"),
    F.col("outage_category"),
    F.col("customer_experience"),
)
src_inc.write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.incidents")

cust_year = (
    spark.table(f"{SRC}.customer_counts_oc1")
    .agg(F.sum("customers_served").alias("customers_served"))
    .collect()[0]["customers_served"]
)


def monthly_from(filter_sql: str, dataset: str):
    return (
        spark.table(f"{CAT}.reliability_gold.incidents")
        .filter(filter_sql)
        .groupBy(F.year("start_ts").alias("year"), F.month("start_ts").alias("month"))
        .agg(
            F.sum("customers_interrupted").alias("ci"),
            F.sum(F.col("customers_interrupted") * F.col("duration_min")).alias("cmi"),
            F.count("*").alias("events"),
        )
        .withColumn("company_code", F.lit("OC1"))
        .withColumn("dataset", F.lit(dataset))
        .withColumn("saidi", F.round(F.col("cmi") / F.lit(cust_year), 3))
        .withColumn("saifi", F.round(F.col("ci") / F.lit(cust_year), 4))
        .withColumn("cpi", F.round(F.col("ci") / F.col("events"), 2))
        .select("company_code", "dataset", "year", "month", "saidi", "saifi", "cpi")
    )


kpi_m = (
    monthly_from("outage_category = 'Reported'", "Reported")
    .unionByName(monthly_from("customer_experience = true", "CX"))
    .unionByName(monthly_from("outage_category <> 'Scheduled'", "All"))
)
kpi_m.write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.kpi_monthly")

goals = spark.createDataFrame([("OC1", 2026, 74.2, 0.592)], "company_code STRING, year INT, saidi_goal DOUBLE, saifi_goal DOUBLE")
ytd = (
    kpi_m.filter("year = 2026 AND dataset = 'Reported'")
    .groupBy("company_code")
    .agg(
        F.round(F.sum("saidi"), 2).alias("saidi_actual"),
        F.round(F.sum("saifi"), 3).alias("saifi_actual"),
        F.round(F.avg("cpi"), 1).alias("cpi_actual"),
    )
    .join(goals, "company_code")
    .withColumn("saidi_ye_proj", F.round(F.col("saidi_actual") / 7 * 12, 2))
    .withColumn("saifi_ye_proj", F.round(F.col("saifi_actual") / 7 * 12, 3))
    .withColumn(
        "saidi_funding_pct",
        F.greatest(F.lit(0), F.least(F.lit(200), F.round((2.0 - F.col("saidi_ye_proj") / F.col("saidi_goal")) * 100, 0))),
    )
    .withColumn(
        "saifi_funding_pct",
        F.greatest(F.lit(0), F.least(F.lit(200), F.round((2.0 - F.col("saifi_ye_proj") / F.col("saifi_goal")) * 100, 0))),
    )
)
ytd.write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.kpi_ytd")
goals.write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.kpi_goals")

spark.table(f"{SRC}.rankings_workgroup_oc1").select(
    F.lit("OC1").alias("company_code"),
    F.col("pd_area_name").alias("pd_area"),
    F.col("workgroup_name").alias("workgroup"),
    "customers_served",
    F.col("ci_sustained").cast("int").alias("customers_interrupted"),
    F.col("cmi").cast("bigint").alias("cmi"),
    "saifi",
    "saidi",
    "saifi_rank",
    "saidi_rank",
    "overall_rank",
    F.col("demi4_per_device_reported").alias("demi4"),
    F.col("cemi4_reported").cast("int").alias("cemi10_customers"),
    F.round(F.col("cemi4_per_customer_reported") * 100, 2).alias("cemi10"),
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.reliability_rankings")


def devices_for(filter_sql: str, dataset: str):
    return (
        spark.table(f"{SRC}.outage_detail_oc1")
        .filter(filter_sql)
        .groupBy("device_name", "device_type", "pd_area_name", "workgroup_name", "station_name", "feeder_id", "device_latitude", "device_longitude")
        .agg(
            F.sum(F.when(F.col("outage_date") >= F.date_sub(F.lit(AS_OF), 30), 1).otherwise(0)).alias("mo_1"),
            F.sum(F.when(F.col("outage_date") >= F.date_sub(F.lit(AS_OF), 90), 1).otherwise(0)).alias("mo_3"),
            F.sum(F.when(F.col("outage_date") >= F.date_sub(F.lit(AS_OF), 180), 1).otherwise(0)).alias("mo_6"),
            F.sum(F.when(F.col("outage_date") >= F.date_sub(F.lit(AS_OF), 365), 1).otherwise(0)).alias("mo_12"),
        )
        .select(
            F.col("device_name").alias("device"),
            F.lit("OC1").alias("company_code"),
            F.lit(dataset).alias("dataset"),
            F.col("pd_area_name").alias("pd_area"),
            F.col("workgroup_name").alias("workgroup"),
            F.col("station_name").alias("substation"),
            F.col("feeder_id").cast("int").alias("feeder_id"),
            "device_type",
            F.when(F.col("mo_12") >= 8, "Primary").when(F.col("mo_12") >= 4, "Recurring").otherwise("Watch").alias("flags"),
            F.when(F.col("mo_12") >= 6, "Needs Review").otherwise("Healthy").alias("status"),
            F.when(F.col("mo_12") >= 8, F.lit("NSCHEEFF")).otherwise(F.lit("X2SABEKH")).alias("assignee"),
            F.when(F.col("mo_12") >= 10, 1).when(F.col("mo_12") >= 6, 2).otherwise(F.lit(None).cast("int")).alias("priority"),
            "mo_1",
            "mo_3",
            "mo_6",
            "mo_12",
            F.col("device_latitude").cast("double").alias("lat"),
            F.col("device_longitude").cast("double").alias("lon"),
        )
    )


devices_for("outage_category = 'Reported'", "Reported").unionByName(
    devices_for("customer_experience = true", "CX")
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.devices")

spark.table(f"{SRC}.outage_customer_detail_oc1").groupBy(
    "account_num", "service_address", "pd_area_name", "workgroup_name", "station_name", "feeder_id", "latitude", "longitude"
).agg(
    F.concat_ws(",", F.collect_set("meter_number")).alias("meter_nos"),
    F.min("meter_number").alias("meter_no"),
    F.count("*").alias("total_incidents"),
    F.sum("cmi").cast("int").alias("total_duration"),
    F.date_format(F.max("record_timestamp_utc"), "yyyy-MM-dd").alias("last_incident"),
).select(
    F.lit("OC1").alias("company_code"),
    F.col("pd_area_name").alias("pd_area"),
    F.col("workgroup_name").alias("workgroup"),
    F.col("station_name").alias("substation"),
    F.col("feeder_id").cast("int").alias("feeder_id"),
    F.col("account_num").cast("bigint").alias("account_no"),
    F.col("meter_no").cast("int").alias("meter_no"),
    "meter_nos",
    F.col("service_address").alias("address"),
    "total_incidents",
    "total_duration",
    "last_incident",
    F.col("latitude").cast("double").alias("lat"),
    F.col("longitude").cast("double").alias("lon"),
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.customer_incidents")

feeder_cust = (
    spark.table(f"{SRC}.customer_counts_daily_oc1")
    .groupBy(F.col("feeder_id").cast("int").alias("feeder_id"))
    .agg(F.max("customer_count").alias("customers_served"))
)


def wpf_for(filter_sql: str, dataset: str):
    return (
        spark.table(f"{CAT}.reliability_gold.incidents")
        .filter("year(start_ts) >= 2024")
        .filter(filter_sql)
        .groupBy("company_code", "pd_area", "workgroup", "substation", "feeder_id")
        .agg(
            F.sum("customers_interrupted").alias("ci"),
            F.sum(F.col("customers_interrupted") * F.col("duration_min")).alias("cmi"),
            F.count("*").alias("event_count"),
        )
        .join(feeder_cust, "feeder_id")
        .withColumn("dataset", F.lit(dataset))
        .withColumn("saifi", F.round(F.col("ci") / F.col("customers_served"), 3))
        .withColumn("saidi", F.round(F.col("cmi") / F.col("customers_served"), 1))
        .withColumn("cpi", F.round(F.col("ci") / F.col("event_count"), 1))
        .withColumn("si", F.round(F.col("saidi") * F.col("saifi"), 2))
        .withColumn("wpf_rank", F.rank().over(Window.partitionBy("dataset").orderBy(F.col("si").desc())))
    )


wpf_for("status = 'Reported'", "Reported").unionByName(
    wpf_for("status = 'CX' OR customer_experience = true", "CX")
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.worst_performing_feeders")

spark.table(f"{CAT}.reliability_gold.reliability_rankings").select(
    "company_code",
    "pd_area",
    F.col("saidi").alias("saidi_actual"),
    F.round(F.col("saidi") * 0.88, 1).alias("saidi_prior"),
    F.col("saifi").alias("saifi_actual"),
    F.round(F.col("saifi") * 0.9, 3).alias("saifi_prior"),
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.company_breakdown")

centroids = (
    spark.table(f"{CAT}.reliability_gold.incidents")
    .groupBy("pd_area", "workgroup")
    .agg(F.avg("lat").alias("lat"), F.avg("lon").alias("lon"))
    .collect()
)
poly_rows = [
    (
        "OC1",
        r["pd_area"],
        r["workgroup"],
        float(r["lat"]),
        float(r["lon"]),
        json.dumps({"type": "Polygon", "coordinates": [polygon_ring(float(r["lat"]), float(r["lon"]), f"{r['workgroup']}-{r['pd_area']}")]}),
    )
    for r in centroids
    if r["lat"] is not None
]
spark.createDataFrame(
    poly_rows,
    "company_code STRING, pd_area STRING, workgroup STRING, lat DOUBLE, lon DOUBLE, geojson STRING",
).write.mode("overwrite").saveAsTable(f"{CAT}.reliability_gold.workgroup_boundaries")

print("gold rebuilt")
for t in ["incidents", "kpi_monthly", "devices", "customer_incidents", "worst_performing_feeders", "workgroup_boundaries"]:
    print(t, spark.table(f"{CAT}.reliability_gold.{t}").count())
