# Reliability Hub — Databricks App Demo

Rebuild Reliability Hub as a **single unified Databricks App** on `sea-ws` (fevm-serverless-sea202601), with mock medallion data, Lakebase operational state, and an improved enterprise UX.

## Brand

- **Product:** Reliability Hub
- **Customer:** Omed Utilities (OC1 / OC2 / OC3)
- **Visual:** Dark enterprise shell, high-contrast KPIs, cyan for navigation, green/red for goal status. Airier spacing than the original; consistent page chrome (sidebar + context header + content).
- Do **not** clone the original layout 1:1.

## Architecture

```
Job `reliability-gold-daily` (06:00 America/Chicago)
  1. seed_landing  → Parquet into Volume reliability_gold.raw/load_dt=<date>
  2. refresh       → Lakeflow pipeline `reliability-gold` (serverless)

Lakeflow pipeline `reliability-gold` (resources/reliability_gold.pipeline.yml)
  Volume landing  →  bronze_* (Auto Loader streaming tables)
                  →  silver_* MVs  →  reliability_gold marts (MVs)
                  →  feeder_briefs (MV, ai_query on Claude over computed feeder facts;
                                    AI-generated draft text for the top 10 WPF feeders)
                                     ↑ ALL analytical queries in the Lakebase app

Unity Catalog (serverless_sea202601_catalog)
  outage_source  → curated source (exported to the landing volume)
  reliability_gold.raw        → Auto Loader landing volume
  reliability_gold            → bronze / silver / gold owned by the pipeline

Lakebase (projects/reliability-hub)
  app_data.user_preferences, saved_views, groups, help_requests, chat_pins
                 ↑ operational / transactional / low-latency

Databricks App (AppKit)
  analytics SQL warehouse  → gold layer (OBO, runs as signed-in user)
  lakebase                 → CRUD + preferences (service principal)
  genie space              → Reliability AI Assistant (OBO, inherits row filter)
```

A second app, **reliability-hub-nolk**, keeps every feature and drops Lakebase. Groups, help, prefs, and saved views live in an in-memory store flushed as one JSON file to `reliability_app.state` (UC volume), with `/Workspace/Shared/reliability-hub-nolk/app_state.json` as fallback. Saves are a Files API PUT, not a warehouse MERGE. Charts and Genie are unchanged. Deploy with `scripts/deploy-nolk.sh`.

## Permissions decision

**Use one app, not one deployment per OpCo.**

Separate browser tabs / app instances isolate access only by duplicating the product. That is operationally expensive, fragments saved views, and blocks a true executive landing page.

The better pattern:

1. **Unity Catalog** as the system of record for data access (row filters on `company_code`, grants on gold tables).
2. **App entitlements** derived from the signed-in user's Databricks groups to hide nav items and OpCo chips the user cannot use.
3. **One hub** whose Executive Summary is the landing page, with in-app drill-down into authorized OpCos.
4. **User auth for analytics and the assistant.** Gold queries are `*.obo.sql` and
   the Reliability AI Assistant is a Genie space; both run as the signed-in user
   via the `sql` and `dashboards.genie` user API scopes, so the `visible_opco`
   row filter applies to charts and to natural-language answers alike. Lakebase
   (preferences, saved views, groups CRUD) stays on the app service principal.

Groups used by the app:

- `reliability-exec-all` — ALL + OC1 + OC2 + OC3
- `reliability-opco-oc1` — OC1
- `reliability-opco-oc2` — OC2
- `reliability-opco-oc3` — OC3
- `reliability-app-admin` — enables admin preview mode

The server resolves `x-forwarded-email` and the OBO token, calls the Databricks
current-user SCIM endpoint, and returns a minimal entitlement payload. The
normal OpCo selector is limited to assigned groups. Admin preview can simulate
each business group's navigation without changing the administrator's data
identity.

The sea-ws demo currently uses workspace-local groups because the active
workspace credential does not have account SCIM administration. Those
groups **cannot receive Unity Catalog grants** (`PRINCIPAL_DOES_NOT_EXIST`).
Until they are promoted to account groups:

- App CAN_USE is granted to the workspace groups (nav/entitlements).
- Gold `SELECT` is granted to `account users`; row filter
  `reliability_gold.visible_opco` is what actually partitions OpCo rows.
- The filter honors `is_account_group_member()` **and**
  `reliability_gold.user_opco_access` keyed by `session_user()`, so testers
  need an email row in that table (workspace groups are invisible to UC).

Production should provision the same names as account groups through the
enterprise IdP, grant `SELECT` to those groups instead of `account users`,
and keep the row filter.

## Use cases in the app

- Executive Summary (system + OpCo cards, SAIDI/SAIFI, YE funding bands)
- Company breakdown, reliability rankings, historical heatmaps
- Incidents, devices (map + table), customer incidents
- Groups CRUD, worst-performing feeders (with AI feeder briefs), help requests, user settings
- Reliability AI Assistant: floating widget → expandable, pinnable sidebar

## Workspace

- Profile: `sea-ws`
- Catalog: `serverless_sea202601_catalog`
- Warehouse: Serverless Starter Warehouse `b7469619d98a1547`
- Lakebase: `projects/reliability-hub`
