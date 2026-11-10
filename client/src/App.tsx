import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import { useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  Activity,
  Bookmark,
  Check,
  ChevronDown,
  Cpu,
  Gauge,
  HelpCircle,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Eye,
  TrendingDown,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AssistantDock } from './components/AssistantDock';
import {
  LIVE_OPCO,
  LIVE_OPCOS,
  OPCO_META,
  REPORTING_AS_OF,
  isOpCoCode,
  opcoMeta,
  type OpCoCode,
} from './lib/constants';
import { applyColorMode } from './lib/theme';
import {
  CustomersPage,
  DevicesPage,
  ExecutivePage,
  GroupsPage,
  HelpPage,
  HistoricalPage,
  IncidentsPage,
  RankingsPage,
  SettingsPage,
  WpfPage,
} from './pages/views';

type ViewKey =
  | 'executive'
  | 'company'
  | 'rankings'
  | 'historical'
  | 'incidents'
  | 'devices'
  | 'customers'
  | 'groups'
  | 'wpf'
  | 'help'
  | 'settings';

type Persona = 'exec' | 'opco' | 'coming_soon';

interface PreviewGroup {
  group: string;
  label: string;
  opcos: OpCoCode[];
  views: ViewKey[];
  comingSoon?: boolean;
  chip?: string;
  persona?: Persona;
}

interface Entitlements {
  user: { id: string; email: string; displayName: string };
  groups: string[];
  opcos: OpCoCode[];
  views: ViewKey[];
  isAdmin: boolean;
  landingPath: string;
  adminPreview: PreviewGroup[];
  adminViews: ViewKey[];
}

type HubCtx = {
  opco: OpCoCode;
  email: string;
  persona: Persona;
};

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  view: ViewKey;
  badge?: boolean;
}

const nav: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Overview',
    items: [
      { to: '/', label: 'Executive summary', icon: LayoutDashboard, view: 'executive' },
      { to: '/rankings', label: 'Rankings', icon: Gauge, view: 'rankings' },
      { to: '/historical', label: 'Historical', icon: History, view: 'historical' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/incidents', label: 'Incidents', icon: Zap, view: 'incidents', badge: true },
      { to: '/devices', label: 'Devices', icon: Cpu, view: 'devices' },
      { to: '/customers', label: 'Customer incidents', icon: Users, view: 'customers' },
      { to: '/wpf', label: 'Worst feeders', icon: TrendingDown, view: 'wpf' },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { to: '/groups', label: 'Groups', icon: UsersRound, view: 'groups' },
      { to: '/help', label: 'Help request', icon: HelpCircle, view: 'help' },
      { to: '/settings', label: 'Settings', icon: Settings, view: 'settings' },
    ],
  },
];

const PAGE_LABEL = Object.fromEntries(
  nav.flatMap((g) => g.items).map((i) => [i.to, i.label]),
) as Record<string, string>;

function initials(name: string) {
  return name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function Layout() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/entitlements')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to resolve your Reliability access');
        return (await response.json()) as Entitlements;
      })
      .then(setEntitlements)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-8">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h1 className="text-lg font-semibold text-rose-900">Reliability access unavailable</h1>
          <p className="mt-2 text-sm text-rose-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!entitlements) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        Resolving your Reliability access…
      </div>
    );
  }

  return <AuthorizedLayout entitlements={entitlements} />;
}

function OpcoSwitcher({
  highlight = LIVE_OPCO,
  available = LIVE_OPCOS,
}: {
  highlight?: OpCoCode;
  available?: readonly OpCoCode[];
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const chips = OPCO_META.filter((item) => available.includes(item.code));

  const hrefFor = (code: OpCoCode) => {
    const next = new URLSearchParams(params);
    next.set('opco', code);
    const qs = next.toString();
    return `${location.pathname}${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-slate-900">
      {chips.map((item) => {
        const selected = item.code === highlight;
        if (selected) {
          return (
            <span
              key={item.code}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {item.code}
            </span>
          );
        }
        return (
          <NavLink
            key={item.code}
            to={hrefFor(item.code)}
            title={item.name}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {item.code}
          </NavLink>
        );
      })}
    </div>
  );
}

interface SavedView {
  id: number;
  name: string;
  page: string;
  filters: { search?: string } | null;
}

function SavedViewsMenu({ email }: { email: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = () =>
    fetch(`/api/views/${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((rows: SavedView[]) => setViews(Array.isArray(rows) ? rows : []))
      .catch(() => setViews([]));

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    const opcoFromUrl = new URLSearchParams(location.search).get('opco');
    const company = isOpCoCode(opcoFromUrl) ? opcoFromUrl : LIVE_OPCO;
    await fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: email,
        name: name.trim(),
        company_code: company,
        page: location.pathname,
        filters: { opco: company, search: location.search },
      }),
    });
    setName('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    await load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Saved views
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Your views
          </div>
          <div className="max-h-64 overflow-y-auto">
            {views.length === 0 ? (
              <div className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">No saved views yet.</div>
            ) : (
              views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void navigate(`${v.page}${v.filters?.search ?? ''}`);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <span className="truncate text-slate-800 dark:text-slate-100">{v.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {PAGE_LABEL[v.page] ?? v.page}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="mt-2 border-t border-slate-100 px-2 pt-2 dark:border-white/10">
            <div className="mb-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Save “{PAGE_LABEL[location.pathname] ?? location.pathname}” with current filters
            </div>
            <div className="flex gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                }}
                placeholder="View name"
                className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void save()}
                className="flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
              >
                {saved ? <Check className="h-3.5 w-3.5" /> : null}
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthorizedLayout({ entitlements }: { entitlements: Entitlements }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [pinned, setPinned] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [adminMode, setAdminMode] = useState(false);
  const [previewGroup, setPreviewGroup] = useState('');

  const preview = entitlements.adminPreview.find((item) => item.group === previewGroup);
  const allowed = adminMode && preview ? preview.opcos : entitlements.opcos;
  const visibleViews = adminMode && preview ? preview.views : entitlements.views;
  const availableOpcos: OpCoCode[] =
    allowed.length > 0 ? allowed : entitlements.isAdmin ? [...LIVE_OPCOS] : [LIVE_OPCO];
  const requestedOpco = params.get('opco');
  const opco: OpCoCode = isOpCoCode(requestedOpco) && availableOpcos.includes(requestedOpco)
    ? requestedOpco
    : availableOpcos[0] ?? LIVE_OPCO;
  const persona: Persona =
    adminMode && preview?.persona
      ? preview.persona
      : entitlements.groups.includes('reliability-exec-all')
        ? 'exec'
        : 'opco';

  useEffect(() => {
    if (params.get('opco') !== opco) {
      const next = new URLSearchParams(params);
      next.set('opco', opco);
      setParams(next, { replace: true });
    }
  }, [opco, params, setParams]);

  useEffect(() => {
    const currentView = nav
      .flatMap((group) => group.items)
      .find((item) => item.to === location.pathname)?.view;
    if (currentView && !visibleViews.includes(currentView)) {
      void navigate('/', { replace: true });
    }
  }, [location.pathname, navigate, visibleViews]);

  useEffect(() => {
    fetch(`/api/prefs/${encodeURIComponent(entitlements.user.email)}`)
      .then((response) => response.json())
      .then((preferences: { assistant_pinned?: boolean; color_mode?: string } | null) => {
        if (preferences?.assistant_pinned) setPinned(true);
        if (preferences?.color_mode === 'Dark' || preferences?.color_mode === 'Light') {
          applyColorMode(preferences.color_mode);
        }
      })
      .catch(() => undefined);
  }, [entitlements.user.email]);

  const { data: countRows } = useAnalyticsQuery('incident_count', {
    opco: sql.string(opco),
  });
  const openCount = Number(countRows?.[0]?.incident_count ?? 0);

  const persistPin = async (next: boolean) => {
    setPinned(next);
    await fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: entitlements.user.email, assistant_pinned: next }),
    }).catch(() => undefined);
  };

  const ctx: HubCtx = { opco, email: entitlements.user.email, persona };

  if (allowed.length === 0 && !entitlements.isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-8">
        <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">Reliability group required</h1>
          <p className="mt-2 text-sm text-amber-800">
            {entitlements.user.email} is signed in but is not assigned to a Reliability group. Ask an
            administrator to add the user to reliability-opco-oc1 or reliability-exec-all.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`${navOpen ? 'w-64' : 'w-[68px]'} sticky top-0 h-screen shrink-0 border-r border-slate-200 bg-white flex flex-col transition-[width] duration-200 dark:border-white/10 dark:bg-slate-950`}
      >
        <div className="flex h-16 items-center gap-2.5 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
            <Activity className="h-4.5 w-4.5" />
          </div>
          {navOpen && (
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">Reliability Hub</div>
              <div className="text-[11px] text-slate-500 leading-tight">
                {persona === 'opco' ? opcoMeta(opco).name : 'Omed Utilities'}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {nav.map((group) => {
            const items = group.items.filter((item) => visibleViews.includes(item.view));
            if (items.length === 0) return null;
            return (
              <div key={group.section}>
                {navOpen && (
                  <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                    {group.section}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={`${item.to}?opco=${opco}`}
                      end={item.to === '/'}
                      title={navOpen ? undefined : item.label}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-500/15 dark:text-blue-200'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {navOpen && (
                        <span className="flex-1 truncate">
                          {item.view === 'executive' && persona !== 'exec'
                            ? 'Performance'
                            : item.label}
                        </span>
                      )}
                      {navOpen && item.badge && openCount > 0 && !preview?.comingSoon && (
                        <span className="tabular rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 ring-1 ring-inset ring-rose-600/15">
                          {openCount.toLocaleString()}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-3 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {initials(entitlements.user.displayName)}
            </div>
            {navOpen && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                  {entitlements.user.displayName}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {adminMode && preview ? preview.label : entitlements.groups.join(' · ')}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
              aria-label="Toggle navigation"
            >
              {navOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-6 backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
            <OpcoSwitcher highlight={opco} available={availableOpcos} />
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              Data as of {REPORTING_AS_OF}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <SavedViewsMenu email={entitlements.user.email} />
              {entitlements.adminPreview.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !adminMode;
                    setAdminMode(next);
                    if (next && !previewGroup) {
                      setPreviewGroup(entitlements.adminPreview[0]?.group ?? '');
                    }
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                    adminMode
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View as
                </button>
              )}
              {adminMode && (
                <Select value={previewGroup} onValueChange={setPreviewGroup}>
                  <SelectTrigger className="h-8 w-[240px] text-xs">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {entitlements.adminPreview.map((item) => (
                      <SelectItem key={item.group} value={item.group}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </header>

          {adminMode && preview && (
            <div className="border-b border-violet-200 bg-violet-50 px-6 py-2 text-xs text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
              Previewing <span className="font-medium">{preview.label}</span>
              {preview.persona === 'exec'
                ? '. Omed Utilities portfolio — OC1, OC2, and OC3 are live.'
                : `. ${preview.chip ?? 'OpCo'} operator view.`}
            </div>
          )}

          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10">
              <Outlet context={ctx} />
            </div>
          </main>
        </div>
        <AssistantDock pinned={pinned} onPinnedChange={(value) => void persistPin(value)} />
      </div>
    </div>
  );
}

function useHub() {
  return useOutletContext<HubCtx>();
}

function ExecutiveRoute() {
  const hub = useHub();
  return <ExecutivePage opco={hub.opco} persona={hub.persona === 'opco' ? 'opco' : 'exec'} />;
}
function GroupsRoute() {
  return <GroupsPage opco={useHub().opco} />;
}
function RankingsRoute() {
  return <RankingsPage opco={useHub().opco} />;
}
function HistoricalRoute() {
  return <HistoricalPage opco={useHub().opco} />;
}
function IncidentsRoute() {
  return <IncidentsPage opco={useHub().opco} />;
}
function DevicesRoute() {
  return <DevicesPage opco={useHub().opco} />;
}
function CustomersRoute() {
  return <CustomersPage opco={useHub().opco} />;
}
function WpfRoute() {
  return <WpfPage opco={useHub().opco} />;
}
function HelpRoute() {
  return <HelpPage email={useHub().email} />;
}
function SettingsRoute() {
  return <SettingsPage email={useHub().email} />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ExecutiveRoute /> },
      { path: '/company', element: <Navigate to={`/?opco=${LIVE_OPCO}&tab=reliability`} replace /> },
      { path: '/rankings', element: <RankingsRoute /> },
      { path: '/historical', element: <HistoricalRoute /> },
      { path: '/incidents', element: <IncidentsRoute /> },
      { path: '/devices', element: <DevicesRoute /> },
      { path: '/customers', element: <CustomersRoute /> },
      { path: '/groups', element: <GroupsRoute /> },
      { path: '/wpf', element: <WpfRoute /> },
      { path: '/help', element: <HelpRoute /> },
      { path: '/settings', element: <SettingsRoute /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
