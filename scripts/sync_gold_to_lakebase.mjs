#!/usr/bin/env node
/**
 * Sync the hottest reliability_gold views into Lakebase Postgres (schema gold)
 * so the app can show snappy OLTP reads vs warehouse analytics.
 *
 * Prefer UC synced tables under reliability_hub_oltp once OpCo security is ABAC
 * (table-level SET ROW FILTER blocks synced tables). This script remains as a
 * direct Postgres load fallback when synced-table pipelines are unavailable.
 *
 * Usage:
 *   node scripts/sync_gold_to_lakebase.mjs [--profile sea-ws]
 */
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const PROFILE = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : 'sea-ws';
const WAREHOUSE_ID = 'b7469619d98a1547';
const SOURCE_CATALOG = 'serverless_sea202601_catalog';
const SOURCE_SCHEMA = 'reliability_gold';
const ENDPOINT = 'projects/reliability-hub/branches/production/endpoints/primary';
const PG_DATABASE = 'databricks_postgres';
const PG_SCHEMA = 'gold';

/** Hottest landing / nav tables (portion of gold). Keep PKs unique. */
const TABLES = [
  {
    name: 'kpi_ytd',
    pk: ['company_code', 'year'],
    columns: [
      'company_code',
      'saidi_actual',
      'saifi_actual',
      'cpi_actual',
      'year',
      'saidi_goal',
      'saifi_goal',
      'saidi_ye_proj',
      'saifi_ye_proj',
      'saidi_funding_pct',
      'saifi_funding_pct',
    ],
  },
  {
    name: 'kpi_monthly',
    pk: ['company_code', 'dataset', 'year', 'month'],
    columns: ['company_code', 'dataset', 'year', 'month', 'saidi', 'saifi', 'cpi'],
  },
  {
    name: 'company_breakdown',
    pk: ['company_code', 'pd_area'],
    columns: [
      'company_code',
      'pd_area',
      'saidi_actual',
      'saidi_prior',
      'saifi_actual',
      'saifi_prior',
    ],
  },
  {
    name: 'worst_performing_feeders',
    pk: ['company_code', 'dataset', 'feeder_id'],
    columns: [
      'wpf_rank',
      'company_code',
      'pd_area',
      'workgroup',
      'substation',
      'feeder_id',
      'customers_served',
      'ci',
      'saifi',
      'cmi',
      'saidi',
      'si',
      'cpi',
      'event_count',
      'dataset',
    ],
  },
  {
    name: 'reliability_rankings',
    pk: ['company_code', 'pd_area', 'workgroup'],
    // Pipeline can land duplicate workgroup rows; keep one.
    distinctOn: ['company_code', 'pd_area', 'workgroup'],
    columns: [
      'company_code',
      'pd_area',
      'workgroup',
      'customers_served',
      'customers_interrupted',
      'cmi',
      'saifi',
      'saidi',
      'saifi_rank',
      'saidi_rank',
      'overall_rank',
      'demi4',
      'cemi10_customers',
      'cemi10',
    ],
  },
  {
    name: 'feeder_briefs',
    pk: ['company_code', 'feeder_id'],
    columns: [
      'company_code',
      'feeder_id',
      'pd_area',
      'workgroup',
      'substation',
      'wpf_rank',
      'saifi',
      'saidi',
      'si',
      'customers_served',
      'event_count',
      'events_last_12m',
      'events_prior_12m',
      'avg_restore_min',
      'cx_share_pct',
      'top_causes',
      'facts',
      'brief',
      'generated_at',
    ],
  },
  {
    name: 'inspection_device_risk',
    pk: ['company_code', 'device'],
    columns: [
      'company_code',
      'device',
      'device_type',
      'pd_area',
      'workgroup',
      'substation',
      'feeder_id',
      'lat',
      'lon',
      'inspection_count',
      'open_findings',
      'critical_findings',
      'max_severity',
      'last_inspected_at',
      'latest_defect',
      'device_mo_12',
      'device_status',
      'risk_score',
      'risk_band',
    ],
  },
  {
    name: 'cx_metrics',
    pk: ['company_code'],
    columns: [
      'company_code',
      'avg_minutes_ytd',
      'avg_minutes_delta_7yr',
      'avg_minutes_l12m',
      'avg_minutes_delta_12m',
      'avg_count_ytd',
      'avg_count_delta_7yr',
      'avg_count_l12m',
      'avg_count_delta_12m',
    ],
  },
  {
    name: 'devices',
    pk: ['company_code', 'device', 'dataset'],
    columns: [
      'device',
      'company_code',
      'flags',
      'status',
      'assignee',
      'priority',
      'pd_area',
      'workgroup',
      'substation',
      'feeder_id',
      'device_type',
      'mo_1',
      'mo_3',
      'mo_6',
      'mo_12',
      'lat',
      'lon',
      'dataset',
    ],
  },
];

function cliJson(args) {
  const r = spawnSync('databricks', [...args, '--profile', PROFILE, '-o', 'json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`databricks ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  }
  const out = (r.stdout || '').trim();
  return out ? JSON.parse(out) : {};
}

function api(method, path, body) {
  const args = ['api', method.toLowerCase(), path];
  if (body !== undefined) {
    args.push('--json', JSON.stringify(body));
  }
  return cliJson(args);
}

async function runSql(statement) {
  const created = api('post', '/api/2.0/sql/statements', {
    warehouse_id: WAREHOUSE_ID,
    catalog: SOURCE_CATALOG,
    schema: SOURCE_SCHEMA,
    wait_timeout: '50s',
    statement,
  });
  let state = created.status?.state;
  let payload = created;
  const id = created.statement_id;
  while (state === 'PENDING' || state === 'RUNNING') {
    await new Promise((r) => setTimeout(r, 1500));
    payload = api('get', `/api/2.0/sql/statements/${id}`);
    state = payload.status?.state;
  }
  if (state !== 'SUCCEEDED') {
    throw new Error(`SQL failed (${state}): ${JSON.stringify(payload.status?.error || payload)}`);
  }
  const cols = (payload.manifest?.schema?.columns || []).map((c) => c.name);
  const rows = payload.result?.data_array || [];
  // Fetch remaining chunks if any
  let next = payload.result?.next_chunk_internal_link;
  while (next) {
    // next_chunk_internal_link is a path like /api/2.0/sql/statements/.../result/chunks/N
    const chunk = api('get', next.replace(/^https?:\/\/[^/]+/, ''));
    rows.push(...(chunk.data_array || []));
    next = chunk.next_chunk_internal_link;
  }
  return { cols, rows };
}

function pgType(col, sampleVals) {
  const name = col.toLowerCase();
  if (name.endsWith('_at') || name === 'generated_at' || name === 'last_inspected_at') {
    return 'timestamptz';
  }
  const samples = (sampleVals || []).filter((v) => v !== null && v !== undefined && v !== '');
  const looksFloat = samples.some((v) => {
    const s = String(v);
    return s.includes('.') || /e[+-]?\d+/i.test(s);
  });
  const looksNonNumeric = samples.some((v) => Number.isNaN(Number(v)));

  const intNames = new Set([
    'year',
    'month',
    'priority',
    'feeder_id',
    'wpf_rank',
    'saifi_rank',
    'saidi_rank',
    'overall_rank',
    'max_severity',
    'customers_served',
    'customers_interrupted',
    'cemi10_customers',
    'event_count',
    'events_last_12m',
    'events_prior_12m',
    'inspection_count',
    'open_findings',
    'critical_findings',
    'device_mo_12',
    'mo_1',
    'mo_3',
    'mo_6',
    'mo_12',
  ]);
  const floatNames = new Set([
    'ci',
    'cmi',
    'cpi',
    'si',
    'demi4',
    'cemi10',
    'lat',
    'lon',
    'risk_score',
    'cx_share_pct',
    'avg_restore_min',
    'saidi',
    'saifi',
    'saidi_actual',
    'saidi_prior',
    'saifi_actual',
    'saifi_prior',
    'saidi_goal',
    'saifi_goal',
    'saidi_ye_proj',
    'saifi_ye_proj',
    'saidi_funding_pct',
    'saifi_funding_pct',
    'avg_minutes_ytd',
    'avg_minutes_delta_7yr',
    'avg_minutes_l12m',
    'avg_minutes_delta_12m',
    'avg_count_ytd',
    'avg_count_delta_7yr',
    'avg_count_l12m',
    'avg_count_delta_12m',
  ]);

  if (looksNonNumeric) return 'text';
  if (floatNames.has(name) || looksFloat) return 'double precision';
  if (intNames.has(name)) return 'bigint';
  return 'text';
}

function lit(v) {
  if (v === null || v === undefined) return null;
  return v;
}

async function main() {
  console.log(`Profile ${PROFILE}`);
  const endpoint = cliJson(['postgres', 'get-endpoint', ENDPOINT]);
  const host = endpoint.status?.hosts?.host;
  if (!host) throw new Error('Could not resolve Lakebase host');

  const me = cliJson(['current-user', 'me']);
  const user = me.userName || me.email || me.emails?.[0]?.value;
  const cred = cliJson(['postgres', 'generate-database-credential', ENDPOINT]);
  const password = cred.token;
  if (!user || !password) throw new Error('Missing Postgres user/token');

  const client = new pg.Client({
    host,
    database: PG_DATABASE,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  await client.connect();
  console.log(`Connected to ${host} as ${user}`);

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${PG_SCHEMA}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PG_SCHEMA}._sync_manifest (
      table_name text PRIMARY KEY,
      row_count bigint NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      source text NOT NULL
    )
  `);

  const summary = [];
  for (const table of TABLES) {
    const fq = `${SOURCE_CATALOG}.${SOURCE_SCHEMA}.${table.name}`;
    const colList = table.columns.join(', ');
    process.stdout.write(`→ ${table.name} ... `);
    const t0 = Date.now();
    const sql = table.distinctOn?.length
      ? `SELECT ${colList} FROM (
           SELECT ${colList},
                  ROW_NUMBER() OVER (PARTITION BY ${table.distinctOn.join(', ')} ORDER BY 1) AS _rn
           FROM ${fq}
         ) s WHERE _rn = 1`
      : `SELECT ${colList} FROM ${fq}`;
    const { cols, rows } = await runSql(sql);
    // Align to declared column order
    const idx = table.columns.map((c) => cols.indexOf(c));
    if (idx.some((i) => i < 0)) {
      throw new Error(`Missing columns for ${table.name}: ${cols.join(',')}`);
    }

    const types = table.columns.map((c, i) =>
      pgType(
        c,
        rows.map((r) => r[idx[i]]),
      ),
    );
    const ddlCols = table.columns
      .map((c, i) => `"${c}" ${types[i]}`)
      .concat([`PRIMARY KEY (${table.pk.map((c) => `"${c}"`).join(', ')})`])
      .join(',\n  ');

    await client.query(`DROP TABLE IF EXISTS ${PG_SCHEMA}.${table.name} CASCADE`);
    await client.query(`CREATE TABLE ${PG_SCHEMA}.${table.name} (\n  ${ddlCols}\n)`);

    if (rows.length) {
      const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO ${PG_SCHEMA}.${table.name} (${table.columns
        .map((c) => `"${c}"`)
        .join(', ')}) VALUES (${placeholders})`;
      // Batch insert
      const batch = 200;
      for (let i = 0; i < rows.length; i += batch) {
        const slice = rows.slice(i, i + batch);
        await client.query('BEGIN');
        try {
          for (const row of slice) {
            const vals = idx.map((j) => lit(row[j]));
            await client.query(insertSql, vals);
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
    }

    await client.query(
      `INSERT INTO ${PG_SCHEMA}._sync_manifest(table_name, row_count, synced_at, source)
       VALUES ($1,$2,now(),$3)
       ON CONFLICT (table_name) DO UPDATE
         SET row_count = EXCLUDED.row_count,
             synced_at = EXCLUDED.synced_at,
             source = EXCLUDED.source`,
      [table.name, rows.length, fq],
    );

    // Warm / latency sample
    const t1 = Date.now();
    const warm = await client.query(`SELECT COUNT(*)::int AS n FROM ${PG_SCHEMA}.${table.name}`);
    const t2 = Date.now();
    const msLoad = t1 - t0;
    const msCount = t2 - t1;
    console.log(
      `${warm.rows[0].n} rows (load ${msLoad}ms, count ${msCount}ms)`,
    );
    summary.push({ table: table.name, rows: warm.rows[0].n, load_ms: msLoad, count_ms: msCount });
  }

  // Snappy probe: kpi_ytd filter by OpCo
  const probe = await client.query(
    `EXPLAIN ANALYZE SELECT * FROM ${PG_SCHEMA}.kpi_ytd WHERE company_code = $1`,
    ['OC1'],
  );
  console.log('\nEXPLAIN ANALYZE gold.kpi_ytd WHERE company_code = OC1:');
  for (const row of probe.rows) console.log(' ', row['QUERY PLAN']);

  await client.end();
  console.log('\nSynced tables in Lakebase schema gold:');
  for (const s of summary) {
    console.log(`  ${s.table.padEnd(28)} ${String(s.rows).padStart(6)} rows`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
