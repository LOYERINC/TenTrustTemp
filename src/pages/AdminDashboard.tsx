import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowUpRight, CircleAlert, CircleCheck, LoaderCircle, LogOut, RefreshCw, ShieldCheck } from '../lib/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SCREENING_API_BASE, ScreeningPackage, screeningApi } from '../lib/screeningApi';

interface ApiHealth {
  status: string;
  service: string;
  environment: string;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [packages, setPackages] = useState<ScreeningPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const [healthResult, packagesResult] = await Promise.allSettled([
      screeningApi<ApiHealth>('/health', {}, false),
      screeningApi<{ packages: ScreeningPackage[] }>('/api/screenings/packages', {}, false),
    ]);
    if (healthResult.status === 'fulfilled') setApiHealth(healthResult.value);
    else setApiHealth(null);
    if (packagesResult.status === 'fulfilled') setPackages(packagesResult.value.packages);
    else setPackages([]);
    if (healthResult.status === 'rejected' || packagesResult.status === 'rejected') {
      setError('Could not load all live service information. Check the API and refresh.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c2340] text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div><p className="font-bold">TenTrust tools</p><p className="text-xs text-slate-500">Live service status</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{user?.email}</span>
            <Link to="/dashboard" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Landlord page</Link>
            <button onClick={async () => { await logout(); navigate('/auth'); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="font-label text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Admin</p><h1 className="mt-2 text-3xl font-black tracking-tight">Service status</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">This page shows live service status. User and payment reports are not ready yet.</p></div>
          <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Check again</button>
        </div>

        {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div>}

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tenant check service</p><h2 className="mt-2 text-xl font-bold">{loading ? 'Checking…' : apiHealth?.status === 'healthy' ? 'Working' : 'Not working'}</h2></div><Activity className="h-5 w-5 text-blue-700" /></div>
            {apiHealth && <p className="mt-2 text-sm text-slate-500">{apiHealth.service} · {apiHealth.environment}</p>}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Packages available</p><h2 className="mt-2 text-xl font-bold">{loading ? 'Checking…' : `${packages.filter((pkg) => pkg.enabled).length} of ${packages.length}`}</h2></div><ShieldCheck className="h-5 w-5 text-blue-700" /></div>
            <p className="mt-2 text-sm text-slate-500">A plan is ready only when its payment and checks are set up.</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Plans</h2><p className="mt-1 text-sm text-slate-500">Prices and status come from the server.</p></div>
          {!packages.length && !loading ? <p className="px-5 py-8 text-sm text-slate-500">Plans could not be loaded.</p> : <div className="divide-y divide-slate-100">
            {packages.map((pkg) => <article key={pkg.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex items-center gap-2"><h3 className="font-semibold">{pkg.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pkg.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{pkg.enabled ? 'Available' : 'Disabled'}</span></div><p className="mt-1 text-sm text-slate-500">{pkg.description}</p>{!pkg.enabled && pkg.unavailable_reason && <p className="mt-1 text-xs text-amber-800">{pkg.unavailable_reason}</p>}</div>
              <div className="font-mono text-sm font-bold">₦{pkg.price.toLocaleString()}</div>
            </article>)}
          </div>}
        </section>

        <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
          <h2 className="font-bold text-blue-950">More admin tools</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-900">User lists, tenant checks, and payment totals need more setup.</p>
          <a href={`${SCREENING_API_BASE}/docs`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-800 hover:underline">View API guide <ArrowUpRight className="h-4 w-4" /></a>
        </section>
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Refreshing live status…</div>}
        {!loading && apiHealth?.status === 'healthy' && <p className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700"><CircleCheck className="h-4 w-4" />Status is up to date</p>}
      </section>
    </main>
  );
}
