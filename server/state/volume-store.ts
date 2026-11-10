import { Readable } from 'node:stream';
import { WorkspaceClient } from '@databricks/sdk-experimental';

export type Prefs = {
  user_email: string;
  pd_area: string | null;
  workgroup: string | null;
  time_format: string;
  map_style: string;
  color_mode: string;
  assistant_pinned: boolean;
  updated_at: string;
};

export type Group = {
  id: number;
  name: string;
  description: string;
  pd_area: string;
  workgroup: string;
  members: string;
  created_at: string;
};

export type HelpRequest = {
  id: number;
  user_email: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

export type SavedView = {
  id: number;
  user_email: string;
  name: string;
  company_code: string;
  page: string;
  filters: unknown;
  created_at: string;
};

type Snapshot = {
  prefs: Prefs[];
  groups: Group[];
  help: HelpRequest[];
  views: SavedView[];
  nextId: number;
};

const SEED_GROUPS: Omit<Group, 'id' | 'created_at'>[] = [
  {
    name: '12th Street Crews',
    description: 'Line restoration — Birmingham metro',
    pd_area: 'Birmingham',
    workgroup: 'Metro Tree',
    members: 'user1@omedutilities.com, user2@omedutilities.com',
  },
  {
    name: 'Anniston Engineering',
    description: 'Protection & planning',
    pd_area: 'Anniston',
    workgroup: 'East Restoration',
    members: 'ops.oc1@omedutilities.com',
  },
];

const DEFAULT_VOLUME_PATH =
  '/Volumes/serverless_sea202601_catalog/reliability_app/state/app_state.json';
const WORKSPACE_FALLBACK = '/Workspace/Shared/reliability-hub-nolk/app_state.json';

const empty = (): Snapshot => ({
  prefs: [],
  groups: [],
  help: [],
  views: [],
  nextId: 1,
});

function now() {
  return new Date().toISOString();
}

function toStream(text: string): ReadableStream {
  return Readable.toWeb(Readable.from([Buffer.from(text, 'utf8')])) as ReadableStream;
}

async function streamToString(stream: ReadableStream | undefined): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * In-memory CRUD with a single JSON snapshot on a UC volume (workspace file
 * as fallback). Mutate first, then persist — saves stay on the order of a
 * Files API PUT instead of a warehouse MERGE.
 */
export class VolumeAppStore {
  private data = empty();
  private persistPath = DEFAULT_VOLUME_PATH;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly workspace = new WorkspaceClient({});

  async init() {
    await this.ensureVolume();
    const loaded = await this.readSnapshot(this.persistPath);
    if (!loaded) {
      const fallback = await this.readSnapshot(WORKSPACE_FALLBACK);
      if (fallback) {
        this.data = fallback;
        this.persistPath = WORKSPACE_FALLBACK;
      }
    } else {
      this.data = loaded;
    }
    if (this.data.groups.length === 0) {
      for (const g of SEED_GROUPS) {
        this.data.groups.push({ ...g, id: this.data.nextId++, created_at: now() });
      }
      await this.persist();
    }
    console.log(`[app-state] ready at ${this.persistPath} (${this.data.groups.length} groups)`);
  }

  getPrefs(email: string) {
    return this.data.prefs.find((p) => p.user_email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async putPrefs(input: Partial<Prefs> & { user_email: string }): Promise<Prefs> {
    const prev = this.getPrefs(input.user_email);
    const row: Prefs = {
      user_email: input.user_email,
      pd_area: input.pd_area !== undefined ? input.pd_area : (prev?.pd_area ?? null),
      workgroup: input.workgroup !== undefined ? input.workgroup : (prev?.workgroup ?? null),
      time_format: input.time_format ?? prev?.time_format ?? 'Standard',
      map_style: input.map_style ?? prev?.map_style ?? 'Light',
      color_mode: input.color_mode ?? prev?.color_mode ?? 'Light',
      assistant_pinned: input.assistant_pinned ?? prev?.assistant_pinned ?? false,
      updated_at: now(),
    };
    const i = this.data.prefs.findIndex((p) => p.user_email.toLowerCase() === row.user_email.toLowerCase());
    if (i >= 0) this.data.prefs[i] = row;
    else this.data.prefs.push(row);
    await this.persist();
    return row;
  }

  listGroups() {
    return [...this.data.groups].sort((a, b) => a.name.localeCompare(b.name));
  }

  async createGroup(input: Omit<Group, 'id' | 'created_at'>): Promise<Group> {
    const row: Group = { ...input, id: this.data.nextId++, created_at: now() };
    this.data.groups.push(row);
    await this.persist();
    return row;
  }

  async updateGroup(id: number, patch: Partial<Omit<Group, 'id' | 'created_at'>>): Promise<Group | null> {
    const row = this.data.groups.find((g) => g.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    await this.persist();
    return row;
  }

  async deleteGroup(id: number) {
    this.data.groups = this.data.groups.filter((g) => g.id !== id);
    await this.persist();
  }

  listHelp() {
    return [...this.data.help].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
  }

  async createHelp(input: Omit<HelpRequest, 'id' | 'status' | 'created_at'>): Promise<HelpRequest> {
    const row: HelpRequest = { ...input, id: this.data.nextId++, status: 'Open', created_at: now() };
    this.data.help.push(row);
    await this.persist();
    return row;
  }

  listViews(email: string) {
    return this.data.views
      .filter((v) => v.user_email.toLowerCase() === email.toLowerCase())
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createView(input: Omit<SavedView, 'id' | 'created_at'>): Promise<SavedView> {
    const row: SavedView = { ...input, id: this.data.nextId++, created_at: now() };
    this.data.views.push(row);
    await this.persist();
    return row;
  }

  private async ensureVolume() {
    const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
    if (!warehouseId) return;
    try {
      await this.workspace.statementExecution.executeStatement({
        warehouse_id: warehouseId,
        statement: 'CREATE SCHEMA IF NOT EXISTS serverless_sea202601_catalog.reliability_app',
        wait_timeout: '50s',
      });
      await this.workspace.statementExecution.executeStatement({
        warehouse_id: warehouseId,
        statement: 'CREATE VOLUME IF NOT EXISTS serverless_sea202601_catalog.reliability_app.state',
        wait_timeout: '50s',
      });
    } catch (err) {
      console.warn('[app-state] could not ensure volume (will try write paths):', (err as Error).message);
    }
  }

  private async readSnapshot(path: string): Promise<Snapshot | null> {
    try {
      const res = await this.workspace.files.download({ file_path: path });
      const text = await streamToString(res.contents);
      const parsed = JSON.parse(text) as Snapshot;
      if (!parsed || !Array.isArray(parsed.groups)) return null;
      return {
        prefs: parsed.prefs ?? [],
        groups: parsed.groups ?? [],
        help: parsed.help ?? [],
        views: parsed.views ?? [],
        nextId: Number(parsed.nextId) || 1,
      };
    } catch {
      return null;
    }
  }

  private persist() {
    const snapshot: Snapshot = JSON.parse(JSON.stringify(this.data)) as Snapshot;
    this.persistQueue = this.persistQueue
      .then(() => this.writeSnapshot(snapshot))
      .catch((err: unknown) => {
        console.error('[app-state] persist failed:', err);
      });
    return this.persistQueue;
  }

  private async writeSnapshot(snapshot: Snapshot) {
    const body = JSON.stringify(snapshot);
    const paths = [this.persistPath];
    if (this.persistPath !== WORKSPACE_FALLBACK) paths.push(WORKSPACE_FALLBACK);
    let lastError: unknown;
    for (const path of paths) {
      try {
        await this.workspace.files.upload({
          file_path: path,
          contents: toStream(body) as never,
          overwrite: true,
        });
        this.persistPath = path;
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
}
