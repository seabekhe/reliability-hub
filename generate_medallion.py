"""Build mock Omed Utilities reliability source data for all operating companies.

Writes serverless_sea202601_catalog.outage_source.* with one set of tables per
company, suffixed _oc1 / _oc2 / _oc3. Every table that carries company data
also carries a company_code column (OC1, OC2, OC3).

The reliability-gold Lakeflow pipeline (pipelines/reliability_gold) reads these
tables through seed_landing.py and builds the gold marts, so this script does
not write any gold tables.
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CAT = "serverless_sea202601_catalog"
SRC = f"{CAT}.outage_source"
spark = SparkSession.builder.getOrCreate()
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {SRC}")
# Full rebuild every run: drop existing source tables so column changes apply cleanly.
for _t in spark.sql(f"SHOW TABLES IN {SRC}").collect():
    spark.sql(f"DROP TABLE IF EXISTS {SRC}.{_t.tableName}")


def h01(s: str) -> float:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


AREAS = {
    "OC1": [
        ("Birmingham", 33.52, -86.81, 410000, ["North Line", "Metro Tree"]),
        ("Mobile", 30.70, -88.04, 285000, ["Coastal Storm", "Metro Tree"]),
        ("Montgomery", 32.37, -86.30, 198000, ["Central Ops", "East Restoration"]),
        ("Tuscaloosa", 33.21, -87.57, 142000, ["West Reliability"]),
        ("Anniston", 33.66, -85.83, 89000, ["East Restoration"]),
        ("Huntsville", 34.73, -86.59, 265000, ["Substation Maint", "North Line"]),
    ],
    "OC2": [
        ("Atlanta", 33.75, -84.39, 920000, ["Central Ops"]),
        ("Savannah", 32.08, -81.09, 210000, ["Coastal Storm"]),
    ],
    "OC3": [
        ("Gulfport", 30.37, -89.09, 175000, ["Coastal Storm"]),
        ("Jackson", 32.30, -90.18, 240000, ["Central Ops"]),
    ],
}

# Per-company mock address and identifier settings.
STATE = {"OC1": "AL", "OC2": "GA", "OC3": "MS"}
ZIP = {"OC1": "35000", "OC2": "30300", "OC3": "39200"}
OUTAGE_ROWS = {"OC1": 2800, "OC2": 700, "OC3": 600}
OUTAGE_ID_START = {"OC1": 2400100000, "OC2": 3400100000, "OC3": 4400100000}
ACCOUNT_BASE = {"OC1": 1000000000, "OC2": 1100000000, "OC3": 1200000000}
# Annual SAIDI / SAIFI goals. kpi_goals.sql in the pipeline must match these.
GOALS = {"OC1": (74.2, 0.592), "OC2": (81.5, 0.710), "OC3": (62.0, 0.540)}

DEVICE_TYPES = ["Recloser", "Fuse", "Sectionalizer", "Breaker", "Transformer", "Switch"]
CAUSES = [
    "Tree (Weather)", "Lightning", "Equipment Failure", "Scheduled Outage",
    "Animal", "Vehicle", "Unknown", "Ice / Snow", "Wind",
]
THREATS = ["Normal", "Slight", "Marginal", "Enhanced", "Moderate"]
AS_OF = date(2026, 7, 31)


# ---- hierarchy ----
wg_rows = []  # company_code, pd_area, workgroup, lat, lon, customers
feeder_rows = []  # feeder_id, company_code, pd_area, workgroup, station, customers, lat, lon
fid = 20000
for co, areas in AREAS.items():
    for area, lat, lon, cust, wgs in areas:
        share = cust // len(wgs)
        for i, wg in enumerate(wgs):
            wlat = lat + (i - 0.4) * 0.08
            wlon = lon + (i - 0.3) * 0.09
            wg_rows.append((co, area, wg, wlat, wlon, share + i * 1200))
            for k in range(4):
                fid += 17
                feeder_rows.append((
                    fid, co, area, wg, f"{area.split()[0]}-{k + 1:02d}",
                    share // 4 + (k * 37) % 400,
                    wlat + (k - 1.5) * 0.03,
                    wlon + (k - 1.5) * 0.04,
                ))

# customer_counts_* (annual, per workgroup). Include one prior year so
# gold marts that join history (cx_metrics 7yr / trailing windows) have a
# denominator for years before the reporting year.
for co in AREAS:
    rows = []
    for o, area, wg, _la, _lo, cust in wg_rows:
        if o != co:
            continue
        # 2025 customers ~ 1–3% below 2026 so year-over-year is non-zero.
        prior = int(cust * (0.97 + h01(f"{co}{wg}2025") * 0.02))
        rows.append((co, area, wg, 2025, prior, "mock_prior_year"))
        rows.append((co, area, wg, 2026, cust, "placeholder_from_2025"))
    spark.createDataFrame(
        rows,
        "company_code STRING, pd_area_name STRING, workgroup_name STRING, year INT, customers_served INT, note STRING",
    ).write.mode("overwrite").saveAsTable(f"{SRC}.customer_counts_{co.lower()}")

# customer_counts_daily_* (feeder x month-start, enough to cart)
daily_cust = []
for fid_, co, area, wg, station, cust, lat, lon in feeder_rows:
    d = date(2024, 1, 1)
    while d <= AS_OF:
        if d.day == 1:
            daily_cust.append((co, d, area, wg, station, str(fid_), cust + int(h01(f"{fid_}{d}") * 40)))
        d += timedelta(days=1)
for co in AREAS:
    spark.createDataFrame(
        [r for r in daily_cust if r[0] == co],
        "company_code STRING, date DATE, pd_area_name STRING, workgroup_name STRING, station_name STRING, feeder_id STRING, customer_count INT",
    ).write.mode("overwrite").saveAsTable(f"{SRC}.customer_counts_daily_{co.lower()}")


# ---- outage_detail_* ----
def build_outages(co: str, n: int, start_id: int):
    feeders = [f for f in feeder_rows if f[1] == co]
    rows = []
    inc_id = start_id
    for i in range(n):
        f = feeders[i % len(feeders)]
        fid_, _, area, wg, station, _cust, lat, lon = f
        r = h01(f"{co}-inc-{i}")
        year = 2023 + (i % 40) // 12
        year = min(year, 2026)
        month = (i % 12) + 1
        if year == 2026 and month > 7:
            month = (i % 7) + 1
        day = 1 + int(r * 26)
        hour = int(h01(f"h{i}{co}") * 23)
        minute = int(h01(f"m{i}{co}") * 59)
        start = datetime(year, month, day, hour, minute)
        dur = 18 + r * (520 if month in (1, 2, 6, 7) else 280)
        end = start + timedelta(minutes=dur)
        cause = CAUSES[int(h01(f"c{i}{co}") * len(CAUSES)) % len(CAUSES)]
        if co == "OC1" and month in (1, 2):
            cause = "Ice / Snow"
        if co == "OC2" and month in (6, 7) and r > 0.4:
            cause = "Wind"
        if co == "OC3" and month == 7 and r > 0.35:
            cause = "Lightning"
        # Real split: Reported (regulatory), CX (customer_experience), All
        if r > 0.82:
            category, is_cx = "Scheduled", False
        elif r > 0.55:
            category, is_cx = "Reported", True
        elif r > 0.28:
            category, is_cx = "Reported", False
        else:
            category, is_cx = "CX", True
        dtype = DEVICE_TYPES[i % len(DEVICE_TYPES)]
        device = f"{dtype[0]}{2000 + (i % 4000)}"
        ci_s = int(10 + r * 1600)
        ci_m = int(r * 120)
        cmi = ci_s * dur
        threat = THREATS[int(h01(f"t{i}{co}") * 5) % 5]
        inc_id += 13
        rows.append((
            f"INC-{inc_id}",
            str(inc_id),
            float(cmi),
            int(ci_s),
            int(ci_m),
            category,
            "Sustained" if dur >= 5 else "Momentary",
            bool(is_cx),
            area,
            wg,
            station,
            f"{station} {fid_}",
            str(fid_),
            device,
            device,
            dtype,
            None,
            f"{lat + (r - 0.5) * 0.28:.5f}",
            f"{lon + (h01(f'lo{i}{co}') - 0.5) * 0.34:.5f}",
            start.date(),
            start,
            end,
            datetime(start.year, start.month, start.day, start.hour),
            float(dur),
            threat,
            threat,
            0,
            "Distribution",
            cause.split()[0],
            cause,
            "Repaired" if r > 0.4 else "Replaced",
            "Sustained",
            "S",
            None,
            "ABC"[i % 3],
            end,
            0.0,
            None,
            None,
            "OMS",
            float(int(r * 8)),
            float(int(r * 6)),
            float(int(3 + r * 20)),
            float(int(r * 4)),
            datetime.utcnow(),
            f"https://idms.omedutilities.com/{inc_id}",
            f"https://gis.omedutilities.com/{device}",
            f"{co}_GIS",
            f"P-{device}",
            f"{{00000000-0000-0000-0000-{inc_id:012d}}}"[:38],
            0.0,
            round(0.4 + r * 1.1, 3),
            round(40 + r * 80, 1),
            round(0.35 + r * 0.9, 3),
            round(35 + r * 70, 1),
            round(0.3 + r * 0.7, 3),
            round(30 + r * 60, 1),
            round(0.28 + r * 0.6, 3),
            round(28 + r * 50, 1),
            round(0.25 + r * 0.5, 3),
            round(25 + r * 45, 1),
        ))
    return rows


OUTAGE_COLS = (
    "incident_name STRING, incident_id STRING, cmi DOUBLE, ci_sustained LONG, ci_momentary LONG, "
    "outage_category STRING, outage_type STRING, customer_experience BOOLEAN, "
    "pd_area_name STRING, workgroup_name STRING, station_name STRING, feeder_name STRING, feeder_id STRING, "
    "device_name STRING, device_id STRING, device_type STRING, bank_id STRING, "
    "device_latitude STRING, device_longitude STRING, outage_date DATE, "
    "start_time_local TIMESTAMP, end_time_local TIMESTAMP, start_date_hour TIMESTAMP, duration_minutes DOUBLE, "
    "cmi_threat_level STRING, ci_threat_level STRING, exclusion_bitmap INT, "
    "incident_type_description STRING, cause_group_name STRING, cause_description STRING, action_description STRING, "
    "outage_type_description STRING, outage_type_code STRING, failed_equipment_description STRING, phase STRING, "
    "ert_local TIMESTAMP, inaccessible DOUBLE, dispatcher_comments STRING, crew_comments STRING, systemtype STRING, "
    "ami_off_event_count DOUBLE, ami_on_event_count DOUBLE, trouble_call_count DOUBLE, prioroity_call_count DOUBLE, "
    "_md_loaded_tstp_utc TIMESTAMP, idms_url STRING, gis_url STRING, "
    "device_gis_source STRING, device_gis_ptag STRING, device_gis_globalid STRING, device_gis_autosymbolrotation DOUBLE, "
    "feeder_saifi DOUBLE, feeder_saidi DOUBLE, station_saifi DOUBLE, station_saidi DOUBLE, "
    "workgroup_saifi DOUBLE, workgroup_saidi DOUBLE, pdarea_saifi DOUBLE, pdarea_saidi DOUBLE, "
    "company_saifi DOUBLE, company_saidi DOUBLE"
)

outages = {co: build_outages(co, OUTAGE_ROWS[co], OUTAGE_ID_START[co]) for co in AREAS}
for co, rows in outages.items():
    outage_df = spark.createDataFrame(rows, OUTAGE_COLS).withColumn("company_code", F.lit(co))
    outage_df.write.mode("overwrite").saveAsTable(f"{SRC}.outage_detail_{co.lower()}")
    spark.table(f"{SRC}.outage_detail_{co.lower()}").write.mode("overwrite").saveAsTable(
        f"{SRC}.outage_detail_hourly_{co.lower()}"
    )

# outage_customer_detail_* — 1–3 meters per account on every other incident
for ci, co in enumerate(AREAS):
    cust_rows = []
    for i, o in enumerate(outages[co]):
        if i % 2:
            continue
        inc_id = o[1]
        area, wg, station, feeder_id = o[8], o[9], o[10], o[12]
        lat, lon = float(o[17]), float(o[18])
        start = o[20]
        n_acct = 1 + int(h01(f"na{co}{inc_id}") * 2)
        for a in range(n_acct):
            acct = str(ACCOUNT_BASE[co] + (i * 17 + a * 3) % 90000000)
            n_meters = 1 + int(h01(f"nm{acct}") * 2.2)  # 1–3
            for m in range(n_meters):
                meter = str(800000 + (i * 11 + a * 5 + m) % 900000)
                street = 100 + (i + a) % 8000
                cust_rows.append((
                    inc_id, f"{co}-{acct}", co, f"{lat:.5f}", f"{lon:.5f}",
                    f"{street} {area} Rd", area, STATE[co], ZIP[co], "TWN", "001",
                    f"Customer {acct[-4:]}", acct, acct, None, None, 12000.0,
                    f"SD-{acct}", f"PRM-{acct}", meter, area, area[:3].upper(),
                    area, area, f"OPC{co[2:]}", area, co, wg.replace(" ", "")[:8], wg,
                    station, station[:4], f"{station} {feeder_id}", feeder_id,
                    o[14], o[34], start, 1 if o[6] == "Sustained" else 0, 0 if o[6] == "Sustained" else 1,
                    float(o[2]) / max(n_acct, 1), o[5], o[6], h01(acct) > 0.85,
                ))

    spark.createDataFrame(
        cust_rows,
        "incident_id STRING, customer_id STRING, company_code STRING, latitude STRING, longitude STRING, "
        "service_address STRING, service_city STRING, service_state STRING, zip_code STRING, town_code STRING, county_code STRING, "
        "account_name STRING, account_num STRING, customer_number STRING, critical_account_code STRING, critical_account_desc STRING, "
        "twelve_months_kwh DOUBLE, customer_key_service_drop STRING, premises_id STRING, meter_number STRING, "
        "pd_area_name STRING, pd_area_id STRING, pd_area_division_name STRING, division_name STRING, "
        "op_center_id STRING, op_center_name STRING, idms_company_code STRING, workgroup_id STRING, workgroup_name STRING, "
        "station_name STRING, station_id STRING, feeder_name STRING, feeder_id STRING, "
        "linked_device_id STRING, linked_device_phases STRING, record_timestamp_utc TIMESTAMP, "
        "sustained_steps LONG, momentary_steps LONG, cmi DOUBLE, outage_category STRING, outage_type STRING, is_cemi BOOLEAN",
    ).write.mode("overwrite").saveAsTable(f"{SRC}.outage_customer_detail_{co.lower()}")

    spark.table(f"{SRC}.outage_detail_{co.lower()}").select(
        "incident_id",
        F.round(F.col("cmi") * F.lit(0.42), 2).alias("estimated_cost"),
        F.lit(85.0).alias("st_hourly_rate"),
        F.lit(127.5).alias("ot_hourly_rate"),
        F.round(F.col("duration_minutes") / 60, 2).alias("crew_hours"),
    ).write.mode("overwrite").saveAsTable(f"{SRC}.outage_cost_{co.lower()}")


# ---- goals_daily_* with Reported / CX / All columns ----
def goals_for(co: str, saidi_goal: float, saifi_goal: float):
    wgs = [(area, wg, cust) for o, area, wg, _la, _lo, cust in wg_rows if o == co]
    total_cust = sum(c for _, _, c in wgs) or 1
    rows = []
    d = date(2024, 1, 1)
    while d <= AS_OF:
        elapsed = d.timetuple().tm_yday / (366 if d.year % 4 == 0 else 365)
        storm = 1.8 if d.month in ((1, 2) if co == "OC1" else (6, 7)) else 1.0
        for area, wg, cust in wgs:
            share = cust / total_cust
            r = h01(f"{co}{wg}{d}")
            # daily increment ~ annual / 365
            saidi_d = (saidi_goal / 365) * storm * (0.7 + r * 0.7)
            saifi_d = (saifi_goal / 365) * storm * (0.7 + r * 0.7)
            # store CMI/CI so gold can rebuild SAIDI/SAIFI
            cmi_goal = saidi_d * cust
            ci_goal = saifi_d * cust
            cmi_act = cmi_goal * (0.75 + r * 0.45)
            ci_act = ci_goal * (0.75 + r * 0.45)
            rows.append((
                area, wg, d, cust,
                cmi_goal, ci_goal, cmi_goal * elapsed * 365 / max(d.timetuple().tm_yday, 1), ci_goal * elapsed * 365 / max(d.timetuple().tm_yday, 1),
                cmi_act, int(ci_act), cmi_act * elapsed * 365 / max(d.timetuple().tm_yday, 1), int(ci_act * elapsed * 365 / max(d.timetuple().tm_yday, 1)),
                cmi_goal * 1.08, ci_goal * 1.08, cmi_goal * 1.08, ci_goal * 1.08,
                cmi_act * 1.12, int(ci_act * 1.12), cmi_act * 1.12, int(ci_act * 1.12),
                cmi_goal * 1.15, ci_goal * 1.15, cmi_goal * 1.15, ci_goal * 1.15,
                cmi_act * 1.18, int(ci_act * 1.18), cmi_act * 1.18, int(ci_act * 1.18),
            ))
        d += timedelta(days=7)  # weekly grain keeps volume sane; columns match daily
    return rows


GOAL_COLS = (
    "pd_area_name STRING, workgroup_name STRING, date DATE, number_of_customers INT, "
    "cmi_daily_goal DOUBLE, ci_daily_goal DOUBLE, cmi_daily_goal_ytd DOUBLE, ci_daily_goal_ytd DOUBLE, "
    "cmi_daily_actual DOUBLE, ci_daily_actual LONG, cmi_daily_actual_ytd DOUBLE, ci_daily_actual_ytd LONG, "
    "cmi_daily_goal_cx DOUBLE, ci_daily_goal_cx DOUBLE, cmi_daily_goal_ytd_cx DOUBLE, ci_daily_goal_ytd_cx DOUBLE, "
    "cmi_daily_actual_cx DOUBLE, ci_daily_actual_cx LONG, cmi_daily_actual_ytd_cx DOUBLE, ci_daily_actual_ytd_cx LONG, "
    "cmi_daily_goal_all DOUBLE, ci_daily_goal_all DOUBLE, cmi_daily_goal_ytd_all DOUBLE, ci_daily_goal_ytd_all DOUBLE, "
    "cmi_daily_actual_all DOUBLE, ci_daily_actual_all LONG, cmi_daily_actual_ytd_all DOUBLE, ci_daily_actual_ytd_all LONG"
)
for co, (saidi_goal, saifi_goal) in GOALS.items():
    spark.createDataFrame(goals_for(co, saidi_goal, saifi_goal), GOAL_COLS).withColumn(
        "company_code", F.lit(co)
    ).write.mode("overwrite").saveAsTable(f"{SRC}.goals_daily_{co.lower()}")

# CRCA daily goals per company
for co in AREAS:
    crca = []
    d = date(2024, 1, 1)
    while d <= AS_OF:
        r = h01(f"crca{co}{d}")
        threat = THREATS[int(r * 5) % 5]
        for hours, base in ((0.5, 0.01), (1, 0.02), (2, 0.06), (3, 0.14), (4, 0.28), (6, 0.55), (8, 0.85), (10, 0.95), (12, 0.99)):
            actual = min(0.99, base * (0.85 + r * 0.3))
            crca.append((co, d, threat, hours, round(base * 1.05, 3), round(actual, 3), "On track" if actual >= base else "Behind"))
        d += timedelta(days=7)
    spark.createDataFrame(
        crca,
        "company_code STRING, date DATE, threat_level STRING, hours DOUBLE, crca_goal DOUBLE, crca_actual DOUBLE, CRCA_status STRING",
    ).write.mode("overwrite").saveAsTable(f"{SRC}.crca_daily_goals_{co.lower()}")

# daily max threat level per company
for co in AREAS:
    rows = []
    d = date(2024, 1, 1)
    while d <= AS_OF:
        rows.append((d, THREATS[int(h01(f"th{co}{d}") * 5) % 5], int(20 + h01(f"n{co}{d}") * 180)))
        d += timedelta(days=1)
    spark.createDataFrame(rows, "date DATE, threat_level STRING, rolling_24h_incidents INT").write.mode("overwrite").saveAsTable(
        f"{SRC}.daily_max_threat_level_{co.lower()}"
    )

spark.createDataFrame(
    [(lvl, lo, hi) for lvl, lo, hi in [("Normal", 0, 20), ("Slight", 21, 40), ("Marginal", 41, 70), ("Enhanced", 71, 120), ("Moderate", 121, 999)]],
    "threat_level STRING, min_incidents INT, max_incidents INT",
).write.mode("overwrite").saveAsTable(f"{SRC}.threat_level_incident_thresholds")

INCIDENT_CI_THRESHOLDS = {
    "OC1": [("Normal", 0, 8), ("Slight", 9, 16), ("Marginal", 17, 28), ("Enhanced", 29, 50), ("Moderate", 51, 999)],
    "OC2": [("Normal", 0, 10)],
    "OC3": [("Normal", 0, 6)],
}
for co, levels in INCIDENT_CI_THRESHOLDS.items():
    spark.createDataFrame(
        [(co, lvl, lo, hi) for lvl, lo, hi in levels],
        "company_code STRING, threat_level STRING, min_ci INT, max_ci INT",
    ).write.mode("overwrite").saveAsTable(f"{SRC}.threat_level_per_incident_thresholds_{co.lower()}")


# ---- rankings from outage_detail_* (rolling-style snapshot per company) ----
def rankings_for(co: str):
    od = spark.table(f"{SRC}.outage_detail_{co.lower()}").filter("outage_date >= '2025-08-01'")
    cust_wg = spark.createDataFrame(
        [(area, wg, cust) for o, area, wg, _a, _b, cust in wg_rows if o == co],
        "pd_area_name STRING, workgroup_name STRING, customers_served INT",
    )
    wg_agg = (
        od.groupBy("pd_area_name", "workgroup_name")
        .agg(F.sum("ci_sustained").alias("ci_sustained"), F.sum("cmi").alias("cmi"), F.count("*").alias("si"))
        .join(cust_wg, ["pd_area_name", "workgroup_name"])
        .withColumn("saifi", F.round(F.col("ci_sustained") / F.col("customers_served"), 3))
        .withColumn("saidi", F.round(F.col("cmi") / F.col("customers_served"), 1))
        .withColumn("cpi", F.round(F.col("ci_sustained") / F.col("si"), 1))
        .withColumn("demi4_reported", (F.col("si") * 0.12).cast("long"))
        .withColumn("demi4_per_device_reported", F.round(F.col("demi4_reported") / 40, 3))
        .withColumn("cemi4_reported", (F.col("customers_served") * 0.02).cast("long"))
        .withColumn("cemi4_per_customer_reported", F.round(F.col("cemi4_reported") / F.col("customers_served"), 4))
    )
    wg_agg = (
        wg_agg.withColumn("saifi_rank", F.rank().over(Window.orderBy(F.col("saifi").asc())))
        .withColumn("saidi_rank", F.rank().over(Window.orderBy(F.col("saidi").asc())))
        .withColumn("demi4_rank", F.rank().over(Window.orderBy(F.col("demi4_per_device_reported").asc())))
        .withColumn("cemi4_rank", F.rank().over(Window.orderBy(F.col("cemi4_per_customer_reported").asc())))
        .withColumn("cpi_rank", F.rank().over(Window.orderBy(F.col("cpi").asc())))
        .withColumn("overall_score", F.round((F.col("saifi_rank") + F.col("saidi_rank") + F.col("demi4_rank") + F.col("cemi4_rank") + F.col("cpi_rank")) / 5, 2))
        .withColumn("overall_rank", F.rank().over(Window.orderBy(F.col("overall_score").asc())))
        .withColumn("window_start", F.lit(date(2025, 8, 1)))
        .withColumn("window_end", F.lit(AS_OF))
        .withColumn("normalized_saifi", F.col("saifi"))
        .withColumn("normalized_saidi", F.col("saidi"))
        .withColumn("normalized_demi4", F.col("demi4_per_device_reported"))
        .withColumn("normalized_cemi4", F.col("cemi4_per_customer_reported"))
        .withColumn("normalized_cpi", F.col("cpi"))
        .withColumn("protective_device_count", F.lit(40).cast("long"))
        .withColumn("si_cpi", F.col("si"))
        .withColumn("ci_cpi", F.col("ci_sustained"))
        .withColumn("overall_score_current_month", F.col("overall_score"))
        .withColumn("overall_rank_current_month", F.col("overall_rank"))
        .withColumn("ci_current_month_sustained", F.col("ci_sustained"))
        .withColumn("saifi_current_month", F.col("saifi"))
        .withColumn("normalized_saifi_current_month", F.col("saifi"))
        .withColumn("saifi_rank_current_month", F.col("saifi_rank"))
        .withColumn("cmi_current_month", F.col("cmi"))
        .withColumn("saidi_current_month", F.col("saidi"))
        .withColumn("normalized_saidi_current_month", F.col("saidi"))
        .withColumn("saidi_rank_current_month", F.col("saidi_rank"))
        .withColumn("demi4_current_month_reported", F.col("demi4_reported"))
        .withColumn("demi4_per_device_current_month_reported", F.col("demi4_per_device_reported"))
        .withColumn("normalized_demi4_current_month", F.col("demi4_per_device_reported"))
        .withColumn("demi4_rank_current_month", F.col("demi4_rank"))
        .withColumn("cemi4_current_month_reported", F.col("cemi4_reported"))
        .withColumn("cemi4_per_customer_current_month_reported", F.col("cemi4_per_customer_reported"))
        .withColumn("normalized_cemi4_current_month", F.col("cemi4_per_customer_reported"))
        .withColumn("cemi4_rank_current_month", F.col("cemi4_rank"))
        .withColumn("si_current_month", F.col("si"))
        .withColumn("si_current_month_cpi", F.col("si"))
        .withColumn("ci_current_month_cpi", F.col("ci_sustained"))
        .withColumn("cpi_current_month", F.col("cpi"))
        .withColumn("normalized_cpi_current_month", F.col("cpi"))
        .withColumn("cpi_rank_current_month", F.col("cpi_rank"))
        .withColumn("company_code", F.lit(co))
    )
    wg_agg.write.mode("overwrite").saveAsTable(f"{SRC}.rankings_workgroup_{co.lower()}")

    pd_agg = (
        wg_agg.groupBy("company_code", "pd_area_name")
        .agg(
            F.sum("customers_served").alias("customers_served"),
            F.sum("ci_sustained").alias("ci_sustained"),
            F.sum("cmi").alias("cmi"),
            F.sum("si").alias("si"),
            F.sum("demi4_reported").alias("demi4_reported"),
            F.sum("cemi4_reported").alias("cemi4_reported"),
            F.sum("si").alias("si_cpi"),
            F.sum("ci_sustained").alias("ci_cpi"),
        )
        .withColumn("saifi", F.round(F.col("ci_sustained") / F.col("customers_served"), 3))
        .withColumn("saidi", F.round(F.col("cmi") / F.col("customers_served"), 1))
        .withColumn("cpi", F.round(F.col("ci_sustained") / F.col("si"), 1))
        .withColumn("demi4_per_device_reported", F.round(F.col("demi4_reported") / 80, 3))
        .withColumn("cemi4_per_customer_reported", F.round(F.col("cemi4_reported") / F.col("customers_served"), 4))
    )
    pd_agg = (
        pd_agg.withColumn("saifi_rank", F.rank().over(Window.orderBy(F.col("saifi").asc())))
        .withColumn("saidi_rank", F.rank().over(Window.orderBy(F.col("saidi").asc())))
        .withColumn("demi4_rank", F.rank().over(Window.orderBy(F.col("demi4_per_device_reported").asc())))
        .withColumn("cemi4_rank", F.rank().over(Window.orderBy(F.col("cemi4_per_customer_reported").asc())))
        .withColumn("cpi_rank", F.rank().over(Window.orderBy(F.col("cpi").asc())))
        .withColumn("overall_score", F.round((F.col("saifi_rank") + F.col("saidi_rank") + F.col("demi4_rank") + F.col("cemi4_rank") + F.col("cpi_rank")) / 5, 2))
        .withColumn("overall_rank", F.rank().over(Window.orderBy(F.col("overall_score").asc())))
        .withColumn("window_start", F.lit(date(2025, 8, 1)))
        .withColumn("window_end", F.lit(AS_OF))
        .withColumn("normalized_saifi", F.col("saifi"))
        .withColumn("normalized_saidi", F.col("saidi"))
        .withColumn("normalized_demi4", F.col("demi4_per_device_reported"))
        .withColumn("normalized_cemi4", F.col("cemi4_per_customer_reported"))
        .withColumn("normalized_cpi", F.col("cpi"))
    )
    pd_agg.write.mode("overwrite").saveAsTable(f"{SRC}.rankings_pdarea_{co.lower()}")


for co in AREAS:
    rankings_for(co)


# ---- summary ----
print("SOURCE")
for t in spark.sql(f"SHOW TABLES IN {SRC}").collect():
    name = t.tableName
    print(f"  {name}: {spark.table(f'{SRC}.{name}').count()}")
