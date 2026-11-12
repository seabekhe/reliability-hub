# Databricks notebook source
# MAGIC %md
# MAGIC # Generate mock asset-inspection events with Wikimedia Commons photos
# MAGIC
# MAGIC Pulls CC-licensed utility / power-line photos from Wikimedia Commons,
# MAGIC writes JPEG copies to the inspections volume, and builds
# MAGIC `outage_source.inspection_events_{oc1,oc2,oc3}` with pre-baked findings.
# MAGIC
# MAGIC Depends on `outage_detail_*` from `generate_medallion.py`.

# COMMAND ----------

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from html import unescape

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

CAT = "serverless_sea202601_catalog"
SRC = f"{CAT}.outage_source"
IMG_ROOT = f"/Volumes/{CAT}/reliability_gold/inspections"
AS_OF = date(2026, 7, 31)
COMPANIES = ["OC1", "OC2", "OC3"]
COUNTS = {"OC1": 120, "OC2": 50, "OC3": 40}

DEFECTS = [
    "vegetation_encroachment",
    "damaged_insulator",
    "leaning_pole",
    "conductor_damage",
    "clear",
]
DEFECT_WEIGHTS = {
    "OC1": [0.38, 0.18, 0.12, 0.12, 0.20],
    "OC2": [0.28, 0.22, 0.15, 0.15, 0.20],
    "OC3": [0.22, 0.20, 0.18, 0.25, 0.15],
}
SOURCES = ["drone", "truck", "crew_phone"]
SUMMARIES = {
    "vegetation_encroachment": "Tree canopy within strike distance of primary. Estimated clearance under 10 ft on the roadside span.",
    "damaged_insulator": "Porcelain chip and tracking marks visible on the insulator skirt. No active arcing in frame.",
    "leaning_pole": "Pole lean estimated 8–12 degrees from vertical toward the span. Base soil looks washed out.",
    "conductor_damage": "Outer strand fray on the center phase. No broken strand free-hanging in this frame.",
    "clear": "No defect visible in frame. Pole, hardware, and vegetation clearance look within tolerance.",
}

# Curated Wikimedia Commons File: titles (CC / public domain). Thumbnails are
# resolved at runtime so the demo always uses a current 640px Commons URL.
COMMONS_FILES = {
    "vegetation_encroachment": [
        "File:Pole-tree.jpg",
        "File:Utility pole and tree.jpg",
        "File:Overhead power lines in Garrol Wood - geograph.org.uk - 570244.jpg",
        "File:Dead trees under a power line - geograph.org.uk - 7233544.jpg",
        "File:Power lines through the forest - geograph.org.uk - 389494.jpg",
        "File:Power lines in the forest - geograph.org.uk - 510657.jpg",
        "File:Abbess Roding - utility pole - Essex England.jpg",
    ],
    "damaged_insulator": [
        "File:Insulator on an overhead powerline.jpg",
        "File:Power Line Insulators - geograph.org.uk - 383626.jpg",
        "File:Power line insulators.jpg",
        "File:Ceramic electric insulator.jpg",
        "File:Top of power line pole - east side.jpg",
        "File:Medium voltage ceramic standoff electric insulator - 20060530.jpg",
    ],
    "leaning_pole": [
        "File:Isaac Leaning Pole Earhart Gert Town.jpg",
        "File:Leaning power pole (5263399813).jpg",
        "File:Leaning pole - geograph.org.uk - 1317084.jpg",
        "File:The Leaning Pole Of Ringshall - geograph.org.uk - 2566555.jpg",
        "File:Hurricane Sandy snapped utility pole Kutztown PA.jpg",
        "File:South Beach utility pole smashed Sandy jeh.jpg",
    ],
    "conductor_damage": [
        "File:Downed Delmarva Power Line (39378994535).jpg",
        "File:Downed power line in Cidra, Puerto Rico after Hurricane Maria.jpg",
        "File:Downed power line and closed road in Morris County, NJ after a storm at night 01.jpg",
        "File:Lineman restrings conductor, Oct. 5 (23671906988).jpg",
        "File:2017 Puebla earthquake power line repair.jpg",
        "File:Western Area Power doing power restoration work in Puerto Rico.jpg",
    ],
    "clear": [
        "File:Double Utility Pole - Sevier County, Tennessee - October 19, 2014.jpg",
        "File:Utility Wires on a utility pole.jpg",
        "File:An utility pole with street light on Ferryhill Road in North Queensferry.jpg",
        "File:Wooden pole - Lesna 1.jpg",
        "File:Overhead power lines in Iran 03.jpg",
        "File:2015-03-25 14 01 24 Unusually tall wooden utility pole along 9th Street near Idaho Street (Interstate 80 Business) in Elko, Nevada.JPG",
    ],
}

UA = {"User-Agent": "OmedReliabilityHub/1.0 (Databricks demo; educational reuse of Commons media)"}

# Display name for the image library shown in the app. Photographer and license
# stay on every image (CC BY / BY-SA requires attribution).
IMAGE_SOURCE_NAME = "Field Inspection Library"

spark = SparkSession.builder.getOrCreate()
dbutils.fs.mkdirs(IMG_ROOT)  # noqa: F821


def h01(s: str) -> float:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def pick_defect(co: str, key: str) -> str:
    r = h01(key)
    cumulative = 0.0
    for defect, weight in zip(DEFECTS, DEFECT_WEIGHTS[co]):
        cumulative += weight
        if r <= cumulative:
            return defect
    return DEFECTS[-1]


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", unescape(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def commons_query(titles: list[str]) -> dict[str, dict]:
    """Resolve File: titles to 640px thumbnail URLs and license metadata."""
    params = {
        "action": "query",
        "format": "json",
        "titles": "|".join(titles),
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": "640",
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    out: dict[str, dict] = {}
    for page in ((data.get("query") or {}).get("pages") or {}).values():
        title = page.get("title")
        info = (page.get("imageinfo") or [{}])[0]
        mime = info.get("mime") or ""
        thumb = info.get("thumburl") or info.get("url")
        if not title or not thumb or not mime.startswith("image/"):
            continue
        md = info.get("extmetadata") or {}
        license_name = strip_html((md.get("LicenseShortName") or {}).get("value") or "")
        artist = strip_html((md.get("Artist") or {}).get("value") or "")[:80]
        out[title] = {
            "title": title,
            "thumb": thumb,
            "url": info.get("url") or thumb,
            "license": license_name or "CC",
            "artist": artist or "Unknown photographer",
            "mime": mime,
        }
    return out


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


# Resolve Commons metadata once, then land unique JPEGs on the volume.
resolved: dict[str, list[dict]] = {defect: [] for defect in DEFECTS}
all_titles = [title for titles in COMMONS_FILES.values() for title in titles]
meta = commons_query(all_titles)
print(f"Resolved {len(meta)} / {len(all_titles)} Commons files")

commons_dir = f"{IMG_ROOT}/commons"
os.makedirs(commons_dir, exist_ok=True)
landed: dict[str, str] = {}
for title, item in meta.items():
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", title.replace("File:", ""))[:80]
    rel = f"commons/{slug}.jpg"
    abs_path = f"{IMG_ROOT}/{rel}"
    if title not in landed:
        try:
            body = download(item["thumb"])
            with open(abs_path, "wb") as fh:
                fh.write(body)
            landed[title] = rel
            print(f"  wrote {rel} ({len(body):,} bytes)")
            time.sleep(0.2)
        except Exception as exc:  # noqa: BLE001 — keep going if one file fails
            print(f"  skip {title}: {exc}")
            continue
    item["rel"] = landed[title]
    item["abs"] = f"{IMG_ROOT}/{landed[title]}"
    for defect, titles in COMMONS_FILES.items():
        if title in titles:
            resolved[defect].append(item)

for defect, items in resolved.items():
    if not items:
        raise RuntimeError(f"No Commons images resolved for {defect}")
    print(f"{defect}: {len(items)} photos")

for co in COMPANIES:
    spark.sql(f"DROP TABLE IF EXISTS {SRC}.inspection_events_{co.lower()}")

device_pools: dict[str, list] = {}
for co in COMPANIES:
    pool = (
        spark.table(f"{SRC}.outage_detail_{co.lower()}")
        .groupBy(
            "device_name",
            "device_type",
            "pd_area_name",
            "workgroup_name",
            "station_name",
            "feeder_id",
            "device_latitude",
            "device_longitude",
        )
        .agg(F.count("*").alias("n"))
        .orderBy(F.col("n").desc())
        .limit(80)
        .collect()
    )
    if not pool:
        raise RuntimeError(f"No devices found in outage_detail_{co.lower()}; run generate_medallion first")
    device_pools[co] = pool

rows = []
for co in COMPANIES:
    pool = device_pools[co]
    for i in range(COUNTS[co]):
        r = h01(f"{co}-insp-{i}")
        idx = min(len(pool) - 1, int((r ** 1.6) * len(pool)))
        d = pool[idx]
        defect = pick_defect(co, f"{co}def{i}")
        photos = resolved[defect]
        photo = photos[int(h01(f"img{co}{i}") * len(photos)) % len(photos)]
        severity = 1 if defect == "clear" else 2 + int(h01(f"sev{co}{i}") * 4)
        confidence = round(0.55 + h01(f"conf{co}{i}") * 0.43, 3)
        source = SOURCES[int(h01(f"src{co}{i}") * len(SOURCES)) % len(SOURCES)]
        captured = AS_OF - timedelta(days=int(h01(f"day{co}{i}") * 120))
        inspection_id = f"INSP-{co}-{i:04d}"
        credit = f"{photo['artist']} · {photo['license']} · {IMAGE_SOURCE_NAME}"
        rows.append(
            (
                inspection_id,
                co,
                d.device_name,
                d.device_type,
                d.pd_area_name,
                d.workgroup_name,
                d.station_name,
                str(d.feeder_id),
                float(d.device_latitude),
                float(d.device_longitude),
                datetime.combine(captured, datetime.min.time()),
                source,
                defect,
                severity,
                confidence,
                SUMMARIES[defect],
                defect,
                photo["abs"],
                photo["rel"],
                photo["thumb"],  # public Commons thumbnail — used by the gallery
                credit,
                photo["license"],
                photo["title"],
                "stubbed",
            )
        )

schema = (
    "inspection_id STRING, company_code STRING, device STRING, device_type STRING, "
    "pd_area STRING, workgroup STRING, substation STRING, feeder_id STRING, "
    "lat DOUBLE, lon DOUBLE, captured_at TIMESTAMP, source STRING, "
    "defect_type STRING, severity INT, confidence DOUBLE, summary STRING, "
    "label_truth STRING, image_path STRING, image_rel_path STRING, "
    "thumbnail_data_url STRING, image_credit STRING, image_license STRING, "
    "commons_title STRING, model_status STRING"
)

for co in COMPANIES:
    subset = [row for row in rows if row[1] == co]
    spark.createDataFrame(subset, schema).write.mode("overwrite").saveAsTable(
        f"{SRC}.inspection_events_{co.lower()}"
    )
    print(f"{co}: {len(subset)} inspection events → {SRC}.inspection_events_{co.lower()}")

print(f"Images under {IMG_ROOT}/commons/")
print(f"Total events: {len(rows)}")
