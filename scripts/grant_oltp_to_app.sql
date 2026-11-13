-- Grant the Reliability Hub app service principal read access to UC synced tables.
-- Run as a Lakebase role that owns / can grant on schema reliability_hub_oltp.
-- App SP application UUID (from app_data table ownership / apps get):

GRANT USAGE ON SCHEMA reliability_hub_oltp TO "304951e6-c1d1-4296-97f4-407f00d48ce8";
GRANT SELECT ON ALL TABLES IN SCHEMA reliability_hub_oltp TO "304951e6-c1d1-4296-97f4-407f00d48ce8";
ALTER DEFAULT PRIVILEGES IN SCHEMA reliability_hub_oltp
  GRANT SELECT ON TABLES TO "304951e6-c1d1-4296-97f4-407f00d48ce8";

GRANT USAGE ON SCHEMA reliability_hub_oltp TO databricks_gateway;
GRANT SELECT ON ALL TABLES IN SCHEMA reliability_hub_oltp TO databricks_gateway;
GRANT USAGE ON SCHEMA reliability_hub_oltp TO databricks_reader_16407;
GRANT SELECT ON ALL TABLES IN SCHEMA reliability_hub_oltp TO databricks_reader_16407;
