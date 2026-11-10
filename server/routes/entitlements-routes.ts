import type { Application, Request } from 'express';

const ALL_VIEWS = [
  'executive',
  'company',
  'rankings',
  'historical',
  'incidents',
  'devices',
  'customers',
  'groups',
  'wpf',
  'help',
  'settings',
] as const;

const GROUP_VIEWS = {
  'reliability-exec-all': {
    label: 'Executive',
    opcos: ['OC1', 'OC2', 'OC3'],
    chip: 'ALL',
    persona: 'exec',
    comingSoon: false,
    views: [...ALL_VIEWS],
  },
  'reliability-opco-oc1': {
    label: 'OC1 operator',
    opcos: ['OC1'],
    chip: 'OC1',
    persona: 'opco',
    comingSoon: false,
    views: [...ALL_VIEWS],
  },
  'reliability-opco-oc2': {
    label: 'OC2 operator',
    opcos: ['OC2'],
    chip: 'OC2',
    persona: 'opco',
    comingSoon: false,
    views: [...ALL_VIEWS],
  },
  'reliability-opco-oc3': {
    label: 'OC3 operator',
    opcos: ['OC3'],
    chip: 'OC3',
    persona: 'opco',
    comingSoon: false,
    views: [...ALL_VIEWS],
  },
} as const;

const ADMIN_GROUP = 'reliability-app-admin';

type GroupName = keyof typeof GROUP_VIEWS;

interface ScimMe {
  id?: string;
  userName?: string;
  displayName?: string;
  groups?: Array<{ display?: string; value?: string; type?: string }>;
}

function normalizeHost(host: string): string {
  return host.startsWith('http') ? host : `https://${host}`;
}

async function getSignedInUser(req: Request): Promise<ScimMe> {
  const email = req.header('x-forwarded-email');
  const userId = req.header('x-forwarded-user');
  const token = req.header('x-forwarded-access-token');

  if (token) {
    const host = normalizeHost(process.env.DATABRICKS_HOST ?? '');
    const response = await fetch(`${host}/api/2.0/preview/scim/v2/Me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Current-user lookup failed (${response.status})`);
    }
    return (await response.json()) as ScimMe;
  }

  if (process.env.NODE_ENV === 'development') {
    return {
      id: userId ?? 'dev-user',
      userName: email ?? 'exec.demo@omedutilities.com',
      displayName: 'Local developer',
      groups: [
        { display: 'reliability-exec-all', type: 'direct' },
        { display: ADMIN_GROUP, type: 'direct' },
      ],
    };
  }

  throw new Error('Signed-in user identity is unavailable');
}

export function setupEntitlementsRoutes(server: {
  extend(fn: (app: Application) => void): void;
}) {
  server.extend((app) => {
    app.get('/api/entitlements', async (req, res) => {
      try {
        const user = await getSignedInUser(req);
        const memberships = (user.groups ?? [])
          .map((group) => group.display)
          .filter((group): group is string => Boolean(group));
        const assignedGroups = memberships.filter(
          (group): group is GroupName => group in GROUP_VIEWS,
        );
        const isAdmin = memberships.includes(ADMIN_GROUP);
        const definitions = assignedGroups.map((group) => ({
          group,
          ...GROUP_VIEWS[group],
        }));
        const opcos = [...new Set(definitions.flatMap((item) => item.opcos))];
        const views = [...new Set(definitions.flatMap((item) => item.views))];

        res.json({
          user: {
            id: user.id ?? req.header('x-forwarded-user') ?? '',
            email:
              user.userName ?? req.header('x-forwarded-email') ?? 'unknown',
            displayName: user.displayName ?? user.userName ?? 'Reliability user',
          },
          groups: assignedGroups,
          opcos: assignedGroups.length > 0 || isAdmin ? opcos : [],
          views,
          isAdmin,
          landingPath: '/',
          adminPreview: Object.entries(GROUP_VIEWS).map(([group, definition]) => ({
            group,
            ...definition,
          })),
          adminViews: [...ALL_VIEWS],
        });
      } catch (error) {
        console.error('Failed to resolve user entitlements:', error);
        res.status(401).json({ error: 'Unable to resolve user access' });
      }
    });
  });
}
