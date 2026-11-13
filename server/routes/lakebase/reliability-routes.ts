import { z } from 'zod';
import { Application } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SETUP = [
  `CREATE SCHEMA IF NOT EXISTS app_data`,
  `CREATE TABLE IF NOT EXISTS app_data.user_preferences (
    user_email TEXT PRIMARY KEY,
    pd_area TEXT,
    workgroup TEXT,
    time_format TEXT NOT NULL DEFAULT 'Standard',
    map_style TEXT NOT NULL DEFAULT 'Dark',
    assistant_pinned BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE app_data.user_preferences ADD COLUMN IF NOT EXISTS color_mode TEXT NOT NULL DEFAULT 'Light'`,
  `CREATE TABLE IF NOT EXISTS app_data.saved_views (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    name TEXT NOT NULL,
    company_code TEXT NOT NULL,
    page TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS app_data.groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    pd_area TEXT,
    workgroup TEXT,
    members TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS app_data.help_requests (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

const PrefsBody = z.object({
  user_email: z.string().email(),
  pd_area: z.string().optional().nullable(),
  workgroup: z.string().optional().nullable(),
  time_format: z.string().optional(),
  map_style: z.string().optional(),
  color_mode: z.string().optional(),
  assistant_pinned: z.boolean().optional(),
});

const GroupBody = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  pd_area: z.string().optional().nullable(),
  workgroup: z.string().optional().nullable(),
  members: z.string().optional(),
});

const HelpBody = z.object({
  user_email: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

const ViewBody = z.object({
  user_email: z.string().min(1),
  name: z.string().min(1),
  company_code: z.string().min(1),
  page: z.string().min(1),
  filters: z.unknown().optional(),
});

export async function setupReliabilityLakebaseRoutes(appkit: AppKitWithLakebase) {
  try {
    for (const stmt of SETUP) {
      await appkit.lakebase.query(stmt);
    }
    const { rows } = await appkit.lakebase.query('SELECT COUNT(*)::int AS n FROM app_data.groups');
    if (Number(rows[0]?.n ?? 0) === 0) {
      await appkit.lakebase.query(
        `INSERT INTO app_data.groups (name, description, pd_area, workgroup, members) VALUES
         ('12th Street Crews', 'Line restoration — Birmingham metro', 'Birmingham', 'Metro Tree', 'user1@omedutilities.com, user2@omedutilities.com'),
         ('Anniston Engineering', 'Protection & planning', 'Anniston', 'East Restoration', 'ops.oc1@omedutilities.com')`,
      );
    }
    console.log('[lakebase] app_data schema ready');
  } catch (err) {
    console.warn('[lakebase] setup failed:', (err as Error).message);
  }

  appkit.server.extend((app) => {
    app.get('/api/prefs/:email', async (req, res) => {
      try {
        const result = await appkit.lakebase.query(
          'SELECT * FROM app_data.user_preferences WHERE user_email = $1',
          [req.params.email],
        );
        res.json(result.rows[0] ?? null);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load preferences' });
      }
    });

    app.put('/api/prefs', async (req, res) => {
      try {
        const parsed = PrefsBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.message });
          return;
        }
        const p = parsed.data;
        const result = await appkit.lakebase.query(
          `INSERT INTO app_data.user_preferences
             (user_email, pd_area, workgroup, time_format, map_style, color_mode, assistant_pinned, updated_at)
           VALUES ($1, $2, $3, COALESCE($4, 'Standard'), COALESCE($5, 'Light'), COALESCE($6, 'Light'), COALESCE($7, false), NOW())
           ON CONFLICT (user_email) DO UPDATE SET
             pd_area = COALESCE($2, app_data.user_preferences.pd_area),
             workgroup = COALESCE($3, app_data.user_preferences.workgroup),
             time_format = COALESCE($4, app_data.user_preferences.time_format),
             map_style = COALESCE($5, app_data.user_preferences.map_style),
             color_mode = COALESCE($6, app_data.user_preferences.color_mode),
             assistant_pinned = COALESCE($7, app_data.user_preferences.assistant_pinned),
             updated_at = NOW()
           RETURNING *`,
          [
            p.user_email,
            p.pd_area ?? null,
            p.workgroup ?? null,
            p.time_format ?? null,
            p.map_style ?? null,
            p.color_mode ?? null,
            p.assistant_pinned ?? null,
          ],
        );
        res.json(result.rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save preferences' });
      }
    });

    app.get('/api/groups', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          'SELECT * FROM app_data.groups ORDER BY name',
        );
        res.json(result.rows);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to list groups' });
      }
    });

    app.post('/api/groups', async (req, res) => {
      try {
        const parsed = GroupBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid group' });
          return;
        }
        const g = parsed.data;
        const result = await appkit.lakebase.query(
          `INSERT INTO app_data.groups (name, description, pd_area, workgroup, members)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [g.name, g.description ?? '', g.pd_area ?? '', g.workgroup ?? '', g.members ?? ''],
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create group' });
      }
    });

    app.patch('/api/groups/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const parsed = GroupBody.partial().safeParse(req.body);
        if (isNaN(id) || !parsed.success) {
          res.status(400).json({ error: 'Invalid update' });
          return;
        }
        const g = parsed.data;
        const result = await appkit.lakebase.query(
          `UPDATE app_data.groups SET
             name = COALESCE($2, name),
             description = COALESCE($3, description),
             pd_area = COALESCE($4, pd_area),
             workgroup = COALESCE($5, workgroup),
             members = COALESCE($6, members)
           WHERE id = $1 RETURNING *`,
          [id, g.name ?? null, g.description ?? null, g.pd_area ?? null, g.workgroup ?? null, g.members ?? null],
        );
        res.json(result.rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update group' });
      }
    });

    app.delete('/api/groups/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        await appkit.lakebase.query('DELETE FROM app_data.groups WHERE id = $1', [id]);
        res.status(204).send();
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
      }
    });

    app.get('/api/help', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          'SELECT * FROM app_data.help_requests ORDER BY created_at DESC LIMIT 100',
        );
        res.json(result.rows);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to list help requests' });
      }
    });

    app.post('/api/help', async (req, res) => {
      try {
        const parsed = HelpBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request' });
          return;
        }
        const h = parsed.data;
        const result = await appkit.lakebase.query(
          `INSERT INTO app_data.help_requests (user_email, subject, body) VALUES ($1, $2, $3) RETURNING *`,
          [h.user_email, h.subject, h.body],
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create help request' });
      }
    });

    app.get('/api/views/:email', async (req, res) => {
      try {
        const result = await appkit.lakebase.query(
          'SELECT * FROM app_data.saved_views WHERE user_email = $1 ORDER BY created_at DESC',
          [req.params.email],
        );
        res.json(result.rows);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to list views' });
      }
    });

    app.post('/api/views', async (req, res) => {
      try {
        const parsed = ViewBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid view' });
          return;
        }
        const v = parsed.data;
        const result = await appkit.lakebase.query(
          `INSERT INTO app_data.saved_views (user_email, name, company_code, page, filters)
           VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
          [v.user_email, v.name, v.company_code, v.page, JSON.stringify(v.filters ?? {})],
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save view' });
      }
    });

    // Hot gold slice from UC → Lakebase synced tables (schema reliability_hub_oltp).
    // Created by scripts/create_gold_synced_tables.sh (requires OpCo ABAC, not table RLS).
    const SNAPPY_SCHEMA = 'reliability_hub_oltp';

    app.get('/api/snappy/manifest', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT c.relname AS table_name,
                  GREATEST(c.reltuples, 0)::bigint AS approx_row_count
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1
             AND c.relkind IN ('r', 'p')
             AND c.relname NOT LIKE '%\\_pkey' ESCAPE '\\'
           ORDER BY c.relname`,
          [SNAPPY_SCHEMA],
        );
        res.json({
          schema: SNAPPY_SCHEMA,
          source: 'uc_synced_table',
          tables: result.rows,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          error:
            'Synced tables not available. Apply OpCo ABAC then run scripts/create_gold_synced_tables.sh',
        });
      }
    });

    app.get('/api/snappy/kpi-ytd', async (req, res) => {
      const opco = typeof req.query.opco === 'string' ? req.query.opco : 'OC1';
      const t0 = Date.now();
      try {
        const result = await appkit.lakebase.query(
          `SELECT company_code, year, saidi_actual, saifi_actual, saidi_goal, saifi_goal,
                  saidi_ye_proj, saifi_ye_proj, saidi_funding_pct, saifi_funding_pct
           FROM ${SNAPPY_SCHEMA}.kpi_ytd
           WHERE company_code = $1`,
          [opco],
        );
        const latency_ms = Date.now() - t0;
        res.json({
          source: 'lakebase_synced',
          schema: SNAPPY_SCHEMA,
          table: 'kpi_ytd',
          opco,
          latency_ms,
          rows: result.rows,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          error: `Failed to query ${SNAPPY_SCHEMA}.kpi_ytd from Lakebase`,
        });
      }
    });

    app.get('/api/snappy/inspection-risk', async (req, res) => {
      const opco = typeof req.query.opco === 'string' ? req.query.opco : 'OC1';
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const t0 = Date.now();
      try {
        const result = await appkit.lakebase.query(
          `SELECT device, risk_band, risk_score, open_findings, critical_findings,
                  latest_defect, device_mo_12
           FROM ${SNAPPY_SCHEMA}.inspection_device_risk
           WHERE company_code = $1
           ORDER BY risk_score DESC
           LIMIT $2`,
          [opco, limit],
        );
        res.json({
          source: 'lakebase_synced',
          schema: SNAPPY_SCHEMA,
          table: 'inspection_device_risk',
          opco,
          latency_ms: Date.now() - t0,
          rows: result.rows,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          error: `Failed to query ${SNAPPY_SCHEMA}.inspection_device_risk from Lakebase`,
        });
      }
    });
  });
}
