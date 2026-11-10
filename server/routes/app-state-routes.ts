import { z } from 'zod';
import { Application } from 'express';
import { VolumeAppStore } from '../state/volume-store';

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

export async function setupVolumeStateRoutes(extend: (fn: (app: Application) => void) => void) {
  const store = new VolumeAppStore();
  await store.init();

  extend((app) => {
    app.get('/api/prefs/:email', (req, res) => {
      res.json(store.getPrefs(req.params.email));
    });

    app.put('/api/prefs', (req, res, next) => {
      const parsed = PrefsBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const p = parsed.data;
      store
        .putPrefs({
          user_email: p.user_email,
          pd_area: p.pd_area,
          workgroup: p.workgroup,
          time_format: p.time_format,
          map_style: p.map_style,
          color_mode: p.color_mode,
          assistant_pinned: p.assistant_pinned,
        })
        .then((row) => res.json(row))
        .catch(next);
    });

    app.get('/api/groups', (_req, res) => {
      res.json(store.listGroups());
    });

    app.post('/api/groups', (req, res, next) => {
      const parsed = GroupBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid group' });
        return;
      }
      const g = parsed.data;
      store
        .createGroup({
          name: g.name,
          description: g.description ?? '',
          pd_area: g.pd_area ?? '',
          workgroup: g.workgroup ?? '',
          members: g.members ?? '',
        })
        .then((row) => res.status(201).json(row))
        .catch(next);
    });

    app.patch('/api/groups/:id', (req, res, next) => {
      const id = parseInt(req.params.id, 10);
      const parsed = GroupBody.partial().safeParse(req.body);
      if (Number.isNaN(id) || !parsed.success) {
        res.status(400).json({ error: 'Invalid update' });
        return;
      }
      store
        .updateGroup(id, {
          name: parsed.data.name,
          description: parsed.data.description ?? undefined,
          pd_area: parsed.data.pd_area ?? undefined,
          workgroup: parsed.data.workgroup ?? undefined,
          members: parsed.data.members,
        })
        .then((row) => {
          if (!row) {
            res.status(404).json({ error: 'Not found' });
            return;
          }
          res.json(row);
        })
        .catch(next);
    });

    app.delete('/api/groups/:id', (req, res, next) => {
      const id = parseInt(req.params.id, 10);
      store
        .deleteGroup(id)
        .then(() => res.status(204).send())
        .catch(next);
    });

    app.get('/api/help', (_req, res) => {
      res.json(store.listHelp());
    });

    app.post('/api/help', (req, res, next) => {
      const parsed = HelpBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }
      store
        .createHelp(parsed.data)
        .then((row) => res.status(201).json(row))
        .catch(next);
    });

    app.get('/api/views/:email', (req, res) => {
      res.json(store.listViews(req.params.email));
    });

    app.post('/api/views', (req, res, next) => {
      const parsed = ViewBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid view' });
        return;
      }
      const v = parsed.data;
      store
        .createView({
          user_email: v.user_email,
          name: v.name,
          company_code: v.company_code,
          page: v.page,
          filters: v.filters ?? {},
        })
        .then((row) => res.status(201).json(row))
        .catch(next);
    });
  });
}

export function useVolumeAppState() {
  const forced = process.env.RELIABILITY_STATE_BACKEND;
  if (forced === 'volume') return true;
  if (forced === 'lakebase') return false;
  return !process.env.LAKEBASE_ENDPOINT;
}
