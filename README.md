# Reliability Hub

Omed Utilities reliability analytics on Databricks Apps. This source-table version (`reliability-hub-src`) reads `outage_source` on a Lakehouse//RT warehouse. Charts run as the signed-in user (OBO). App state is a UC volume, not Lakebase.

**What this app uses**
- **Analytics** — SQL in `config/queries/` against the RT warehouse
- **Genie** — Reliability assistant on a serverless warehouse
- **Volume app state** — bookmarks and similar, via `RELIABILITY_STATE_BACKEND=volume`

OC1, OC2, and OC3 are live. Funding and workgroup polygons stay as Coming soon until those fields exist in the source data.

## Prerequisites

- Node.js v22+ and npm
- Databricks CLI
- Access to the `sea-ws` workspace

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Set `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, and `DATABRICKS_GENIE_SPACE_ID` in `.env`. AppKit regenerates query types on `npm run dev`.

## Configure before deploying

This copy is wired to the `sea-ws` workspace (`fevm-serverless-sea202601`). Catalog/schema names used:

- Catalog: `serverless_sea202601_catalog` (workspace catalog; a dedicated `omed_utilities` catalog could not be created without metastore CREATE CATALOG rights)
- Source schema: `outage_source`
- Gold schema: `reliability_gold`
- App-state schema: `reliability_app`
- Lakebase project: `projects/reliability-hub`
- Entitlement groups: `reliability-exec-all`, `reliability-opco-oc1`, `reliability-opco-oc2`, `reliability-opco-oc3`, `reliability-app-admin`

If you deploy elsewhere, replace the host, warehouse ID, Genie space ID, catalog, and group names in `databricks*.yml` and the SQL under `config/` and `pipelines/`.


## Deploy this version

```bash
./scripts/deploy-src.sh
```

The script stages `app.src.yaml` and `databricks.src.yml` as `app.yaml` / `databricks.yml`, swaps in `config/queries-src/`, and deploys `reliability-hub-src`. It does not replace `reliability-hub` or `reliability-hub-nolk`.

Live app: https://reliability-hub-7474653318500167.aws.databricksapps.com

## Project structure

```
client/            React frontend
server/            Express + entitlements + volume state
shared/            Shared types
config/queries/    Gold-path SQL (Lakebase / nolk apps)
config/queries-src Source-table SQL (this app; copied in at deploy)
databricks.src.yml Bundle for reliability-hub-src
app.src.yaml       App env for reliability-hub-src
```

## Tech stack

React, TypeScript, Vite, Tailwind, AppKit analytics + Genie.
