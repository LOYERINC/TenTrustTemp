import CompleteCheckStaffReview from '../components/CompleteCheckStaffReview';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { screeningApi, ScreeningApiError } from '../lib/screeningApi';
import { Button, Logo } from '../components/mvp-ui';
import {
  getAdminVerificationCases,
  getAdminCaseEvidence,
  submitAdminLivenessDecision,
  submitAdminEmploymentDecision,
  submitAdminAddressDecision,
  submitAdminFinalDecision,
  AdminEvidenceResponse,
  formatVerificationError,
} from '../lib/verificationApi';

type Resource = 'users' | 'waitlist' | 'payments' | 'screenings' | 'emails' | 'verifications' | 'provider-lookups';
type Row = Record<string, string | number | boolean | null>;
type Page = { items: Row[]; has_more: boolean };
type Overview = { metrics: Record<string, number | boolean | string | null>; checked_at: string };
const config: Record<Resource, { label: string; search: string; statuses: string[]; columns: [string, string][] }> = {
  users: { label: 'Users', search: 'Search email', statuses: ['confirmed', 'unconfirmed'], columns: [['email', 'Email'], ['first_name', 'First name'], ['role', 'Role'], ['status', 'Email status'], ['created_at', 'Joined'], ['last_sign_in_at', 'Last sign-in']] },
  waitlist: { label: 'Waitlist', search: 'Search email', statuses: ['tenant', 'landlord', 'agent', 'other', 'not-specified'], columns: [['name', 'Name'], ['email', 'Email'], ['role', 'Interest'], ['submitted_at', 'Joined']] },
  payments: { label: 'Payments', search: 'Search reference', statuses: ['pending', 'paid', 'failed'], columns: [['reference', 'Reference'], ['amount_kobo', 'Amount'], ['status', 'Status'], ['mode', 'Mode'], ['provider', 'Provider'], ['created_at', 'Started'], ['verified_at', 'Verified']] },
  screenings: { label: 'Screenings', search: 'Search tenant name', statuses: ['draft', 'payment_pending', 'paid_ready', 'awaiting_tenant', 'processing', 'incomplete', 'complete', 'declined', 'expired'], columns: [['tenant_name', 'Tenant'], ['landlord_email', 'Landlord'], ['package_id', 'Plan'], ['status', 'Progress'], ['payment_status', 'Payment'], ['created_at', 'Started']] },
  emails: { label: 'Emails', search: 'Search recipient', statuses: ['queued', 'sending', 'sent', 'delivered', 'failed', 'unknown', 'suppressed'], columns: [['recipient', 'Recipient'], ['kind', 'Message'], ['source', 'Source'], ['state', 'Delivery'], ['attempts', 'Attempts'], ['last_error_code', 'Issue'], ['created_at', 'Created']] },
  'provider-lookups': { label: 'Interswitch lookups', search: 'Search provider reference', statuses: ['started', 'complete', 'unknown'], columns: [['screening_id', 'Screening'], ['check_type', 'Check'], ['status', 'Status'], ['provider_reference', 'Provider reference'], ['started_at', 'Started']] },
  verifications: { label: 'Verifications (v1)', search: 'Search case ID', statuses: ['needs_review', 'in_progress', 'completed', 'draft', 'expired'], columns: [['id', 'Case ID'], ['status', 'Status'], ['overall_result', 'Result'], ['score', 'Score'], ['created_at', 'Created'], ['expires_at', 'Expires']] },
};
const input = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';
const button = `${input} inline-flex items-center justify-center font-semibold disabled:opacity-50`;
const money = (value: unknown) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value || 0) / 100);
const human = (value: string) => value.replaceAll('_', ' ');
function display(key: string, value: Row[string]) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount_kobo' || key === 'monthly_income_kobo') return money(value);
  if (key.endsWith('_at')) return new Date(String(value)).toLocaleString();
  if (key === 'check_type') return ({ nin: 'NIN', bvn_details: 'BVN', loan_history: 'Loan history' } as Record<string, string>)[String(value)] ?? human(String(value));
  if (key === 'status' && value === 'unknown') return 'Needs reconciliation';
  return human(String(value));
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [gate, setGate] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking');
  const [adminEmail, setAdminEmail] = useState('');
  const [completeReviewId, setCompleteReviewId] = useState<string | null>(null);
  const [tab, setTab] = useState<Resource>('users');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page>({ items: [], has_more: false });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryBusy, setRetryBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const version = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [inspectCase, setInspectCase] = useState<Row | null>(null);
  const [evidence, setEvidence] = useState<AdminEvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceReason, setEvidenceReason] = useState('Reviewing submitted verification evidence for tenancy check');
  const [finalDecision, setFinalDecision] = useState<'pass' | 'review' | 'fail'>('pass');
  const [finalReason, setFinalReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState('');

  const evidenceDialog = useRef<HTMLDialogElement>(null);

  const authorize = useCallback(async () => {
    setGate('checking');
    try {
      const me = await screeningApi<{ email: string }>('/api/admin/me');
      setAdminEmail(me.email); setGate('allowed');
    } catch (err) {
      if (err instanceof ScreeningApiError && err.status === 401) navigate('/auth', { replace: true });
      else setGate(err instanceof ScreeningApiError && err.status === 403 ? 'denied' : 'error');
    }
  }, [navigate]);
  useEffect(() => { void authorize(); }, [authorize]);
  const refresh = useCallback(async () => {
    if (gate !== 'allowed') return;
    const current = ++version.current;
    setLoading(true); setError('');
    const query = new URLSearchParams({ page: String(page), limit: '25', search, status });
    if (start) query.set('start', `${start}T00:00:00Z`);
    if (end) query.set('end', `${end}T23:59:59.999Z`);
    if (tab === 'payments' && mode) query.set('mode', mode);

    try {
      if (tab === 'verifications') {
        const [overviewRes, queueRes] = await Promise.all([
          screeningApi<Overview>('/api/admin/overview').catch(() => null),
          getAdminVerificationCases(status || 'needs_review', 25, (page - 1) * 25, 'Admin reviewer refreshing verification queue'),
        ]);
        if (current !== version.current) return;
        if (overviewRes) setOverview(overviewRes);
        setData({ items: queueRes.items as any, has_more: queueRes.items.length === 25 });
      } else {
        const results = await Promise.allSettled([
          screeningApi<Overview>('/api/admin/overview'), screeningApi<Page>(`/api/admin/${tab}?${query}`),
        ]);
        if (current !== version.current) return;
        if (results.some(r => r.status === 'rejected' && r.reason instanceof ScreeningApiError && [401, 403].includes(r.reason.status))) {
          setGate('denied'); setLoading(false); return;
        }
        if (results[0].status === 'fulfilled') setOverview(results[0].value);
        if (results[1].status === 'fulfilled') setData(results[1].value);
        else setData({ items: [], has_more: false });
        if (results.some(r => r.status === 'rejected')) setError('Some information could not be refreshed. Try again; any summary still shown may be older.');
      }
    } catch (e) {
      setError(formatVerificationError(e));
      setData({ items: [], has_more: false });
    } finally {
      setLoading(false);
    }
  }, [gate, page, search, status, start, end, tab, mode]);
  useEffect(() => {
    void refresh();
    const check = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { ++version.current; clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [refresh]);
  useEffect(() => {
    if (retry && !dialog.current?.open) dialog.current?.showModal();
    if (!retry && dialog.current?.open) dialog.current.close();
  }, [retry]);

  useEffect(() => {
    if (inspectCase && !evidenceDialog.current?.open) evidenceDialog.current?.showModal();
    if (!inspectCase && evidenceDialog.current?.open) evidenceDialog.current.close();
  }, [inspectCase]);

  async function openEvidenceModal(caseRow: Row) {
    setInspectCase(caseRow);
    setEvidence(null);
    setEvidenceLoading(true);
    setEvidenceError('');
    setDecisionNotice('');
    try {
      const data = await getAdminCaseEvidence(String(caseRow.id), evidenceReason.trim());
      setEvidence(data);
    } catch (e) {
      setEvidenceError(formatVerificationError(e));
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function recordLivenessDecision(checkId: string, status: 'passed' | 'failed' | 'manual_review') {
    if (!inspectCase) return;
    setDecisionBusy(true);
    setEvidenceError('');
    try {
      await submitAdminLivenessDecision(String(inspectCase.id), checkId, {
        status,
        reason: 'Reviewer visual comparison of selfie vs available reference photo',
      });
      setDecisionNotice(`Liveness check updated to ${status}.`);
      const updated = await getAdminCaseEvidence(String(inspectCase.id), evidenceReason.trim());
      setEvidence(updated);
    } catch (e) {
      setEvidenceError(formatVerificationError(e));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function recordEmploymentDecision(status: 'verified' | 'failed') {
    if (!inspectCase) return;
    setDecisionBusy(true);
    setEvidenceError('');
    try {
      await submitAdminEmploymentDecision(String(inspectCase.id), {
        verification_status: status,
        verification_method: 'document',
        reason: 'Reviewer checked uploaded pay document and employer details',
      });
      setDecisionNotice(`Employment verification status set to ${status}.`);
      const updated = await getAdminCaseEvidence(String(inspectCase.id), evidenceReason.trim());
      setEvidence(updated);
    } catch (e) {
      setEvidenceError(formatVerificationError(e));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function recordAddressDecision(addressId: string, status: 'verified' | 'failed') {
    if (!inspectCase) return;
    setDecisionBusy(true);
    setEvidenceError('');
    try {
      await submitAdminAddressDecision(String(inspectCase.id), addressId, {
        status,
        reason: 'Reviewer verified address text against utility document',
      });
      setDecisionNotice(`Address verification status set to ${status}.`);
      const updated = await getAdminCaseEvidence(String(inspectCase.id), evidenceReason.trim());
      setEvidence(updated);
    } catch (e) {
      setEvidenceError(formatVerificationError(e));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function recordFinalDecision(e: FormEvent) {
    e.preventDefault();
    if (!inspectCase || finalReason.trim().length < 10) {
      setEvidenceError('Please enter a review reason with at least 10 characters.');
      return;
    }
    setDecisionBusy(true);
    setEvidenceError('');
    try {
      await submitAdminFinalDecision(String(inspectCase.id), {
        result: finalDecision,
        reason: finalReason.trim(),
      });
      setNotice(`Final decision recorded for case ${inspectCase.id}: ${finalDecision.toUpperCase()}`);
      setInspectCase(null);
      void refresh();
    } catch (err) {
      setEvidenceError(formatVerificationError(err));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function queueRetry(event: FormEvent) {
    event.preventDefault();
    if (!retry) return;
    setRetryBusy(true); setRetryError('');
    try {
      await screeningApi(`/api/admin/emails/${retry.id}/retry`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setRetry(null); setNotice('Email queued for retry. Sending remains subject to the email queue status.'); void refresh();
    } catch (err) { setRetryError(err instanceof Error ? err.message : 'The retry could not be queued.'); }
    finally { setRetryBusy(false); }
  }
  if (gate !== 'allowed') return <main className="mx-auto max-w-xl px-5 py-16 text-slate-900">
    <h1 className="text-2xl font-bold">{gate === 'checking' ? 'Checking admin access…' : gate === 'denied' ? 'Administrator access required' : 'Admin service unavailable'}</h1>
    <p className="my-5 text-slate-700">{gate === 'denied' ? 'Your signed-in account does not have permission to use these tools.' : gate === 'error' ? 'Access could not be verified. Please try again shortly.' : 'Verifying your account with the server.'}</p>
    {gate === 'error' && <button className={button} onClick={() => void authorize()}>Try again</button>}
    <Link className={`${button} ml-3`} to="/dashboard">Return to dashboard</Link>
  </main>;
  const metrics = overview?.metrics;
  const cards = metrics ? [
    ['Users', `${metrics.users} (${metrics.confirmed_users} confirmed)`],
    ['Waitlist', `${metrics.waitlist} (+${metrics.waitlist_today} in 24h)`],
    ['Screenings', `${metrics.screenings_complete} complete · ${metrics.screenings_pending} pending`],
    ['Verified live payments', money(metrics.paid_live_kobo)],
    ['Verified test payments', money(metrics.paid_test_kobo)],
    ['Email queue', `${metrics.email_queued} queued · ${metrics.email_failed} failed or suppressed`],
  ] : [];
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5"><Link to="/" aria-label="TenTrust home"><Logo /></Link><span className="text-sm text-slate-600">{adminEmail}</span><div className="flex gap-3"><Link className={button} to="/dashboard">Landlord dashboard</Link><button className={button} onClick={async () => { await logout(); navigate('/auth'); }}>Sign out</button></div></div></header>
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-800">Operations</p><h1 className="mt-2 text-3xl font-bold">TenTrust activity</h1><p className="mt-2 text-sm text-slate-600">Live operational records. Refreshes every minute while this page is visible.</p></div><button className={button} disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-blue-50 p-4 text-blue-900">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <article key={label} className="rounded-xl border bg-white p-5"><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-2 text-lg font-bold">{value}</p></article>)}</div>
      {metrics && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p>Email sending: <strong>{metrics.email_enabled ? 'Enabled' : 'Paused'}</strong>. {String(metrics.email_unknown)} uncertain sends need investigation; {String(metrics.payments_unknown_mode)} payments have an unknown mode and are excluded from live revenue.</p>
        {metrics.email_oldest_due && <p className="mt-2">Oldest queued email due: {new Date(String(metrics.email_oldest_due)).toLocaleString()}.</p>}
        <p className="mt-2">Payment totals are verified gross receipts; fees and refunds are not inferred. Auth emails appear after provider events and cannot be retried here.</p>
      </div>}
      <nav aria-label="Admin records" className="flex gap-2 overflow-x-auto pb-2">{(Object.keys(config) as Resource[]).map(key => <button key={key} aria-current={tab === key ? 'page' : undefined} className={`${button} shrink-0 ${tab === key ? '!border-blue-800 !bg-blue-800 !text-white' : ''}`} onClick={() => { setTab(key); setPage(1); setStatus(''); setSearch(''); setSearchInput(''); setData({ items: [], has_more: false }); }}>{config[key].label}</button>)}</nav>
      {tab === 'provider-lookups' && <section aria-label="Complete Check lookup guidance" className="rounded-xl border border-blue-200 bg-white p-5">
        <h2 className="text-lg font-bold">Complete Check lookups</h2>
        <p className="mt-1 text-sm text-slate-600">Track BVN, NIN, and loan-history attempts. If an outcome is unknown, check with Interswitch using the provider reference before requesting another lookup.</p>
      </section>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(searchInput); }}>
        <label className="text-sm">{config[tab].search}<input className={`${input} mt-1 block`} type="search" maxLength={100} value={searchInput} onChange={e => setSearchInput(e.target.value)} /></label>
        <label className="text-sm">{tab === 'waitlist' ? 'Interest' : 'Status'}<select className={`${input} mt-1 block`} value={status} onChange={e => { setPage(1); setStatus(e.target.value); }}><option value="">All</option>{config[tab].statuses.map(s => <option key={s} value={s}>{human(s)}</option>)}</select></label>
        <label className="text-sm">From (UTC)<input className={`${input} mt-1 block`} type="date" value={start} onChange={e => { setPage(1); setStart(e.target.value); }} /></label>
        <label className="text-sm">Through (UTC)<input className={`${input} mt-1 block`} type="date" min={start} value={end} onChange={e => { setPage(1); setEnd(e.target.value); }} /></label>
        {tab === 'payments' && <label className="text-sm">Mode<select className={`${input} mt-1 block`} value={mode} onChange={e => { setMode(e.target.value); setPage(1); }}><option value="">All</option>{['live', 'test', 'unknown'].map(m => <option key={m}>{m}</option>)}</select></label>}
        <button className={button}>Search</button>
      </form>
      <div className="max-w-full overflow-x-auto rounded-xl border bg-white" aria-busy={loading} tabIndex={0} aria-label={`${config[tab].label} records`}>
        <table className="w-full text-left text-sm"><caption className="sr-only">{config[tab].label}, page {page}</caption><thead className="bg-slate-100 text-slate-700"><tr>{config[tab].columns.map(([key, label]) => <th scope="col" key={key} className="whitespace-nowrap p-4 font-semibold">{label}</th>)}{(tab === 'emails' || tab === 'verifications' || tab === 'screenings') && <th scope="col" className="p-4">Action</th>}</tr></thead>
          <tbody className="divide-y">{data.items.map(row => <tr key={String(row.id)}>{config[tab].columns.map(([key]) => <td className="max-w-xs break-words p-4 align-top" key={key}>{display(key, row[key])}</td>)}{tab === 'emails' && <td className="p-4">{row.retryable ? <button className={button} onClick={() => { setRetry(row); setReason(''); setRetryError(''); }}>Retry</button> : '—'}</td>}{tab === 'screenings' && <td className="p-4">{row.package_id === 'intermediate_v2' && row.status === 'incomplete' ? <button className={button} onClick={() => setCompleteReviewId(String(row.id))}>Review Complete Check</button> : '-'}</td>}{tab === 'verifications' && <td className="p-4"><button className={`${button} !bg-blue-700 !text-white`} onClick={() => void openEvidenceModal(row)}>Review Evidence</button></td>}</tr>)}</tbody>
        </table>{!data.items.length && <p className="p-8 text-slate-600" role="status">{loading ? 'Loading records…' : error ? 'Records could not be loaded.' : 'No matching records.'}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-slate-600">{overview ? `Summary checked ${new Date(overview.checked_at).toLocaleString()}` : 'No summary available yet'}</p><div className="flex items-center gap-3"><button className={button} disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button className={button} disabled={!data.has_more || loading} onClick={() => setPage(p => p + 1)}>Next</button></div></div>
    </section>

    {completeReviewId && <CompleteCheckStaffReview id={completeReviewId} onClose={() => setCompleteReviewId(null)} onPublished={() => { setCompleteReviewId(null); setNotice('Sandbox report published.'); void refresh(); }} />}

    {/* Email retry dialog */}
    <dialog ref={dialog} onCancel={() => setRetry(null)} onClose={() => setRetry(null)} aria-labelledby="retry-title" className="w-[calc(100%-2rem)] max-w-md rounded-2xl border p-6 backdrop:bg-slate-950/50">
      <form onSubmit={queueRetry}><h2 id="retry-title" className="text-xl font-bold">Retry this email</h2><p className="my-4 text-sm text-slate-700">The server will recheck eligibility and record your reason. Delivery is not guaranteed.</p><label className="block text-sm">Reason<textarea autoFocus required minLength={5} maxLength={300} className={`${input} mt-2 block w-full py-3`} value={reason} onChange={e => setReason(e.target.value)} /></label>{retryError && <p role="alert" className="my-3 text-red-800">{retryError}</p>}<div className="mt-5 flex gap-3"><button disabled={retryBusy} className={button}>Queue retry</button><button disabled={retryBusy} type="button" className={button} onClick={() => setRetry(null)}>Cancel</button></div></form>
    </dialog>

    {/* Verification Evidence Inspection Dialog */}
    <dialog ref={evidenceDialog} onCancel={() => setInspectCase(null)} onClose={() => setInspectCase(null)} aria-labelledby="evidence-title" className="w-[calc(100%-2rem)] max-w-4xl rounded-2xl border p-6 backdrop:bg-slate-950/50 max-h-[90vh] overflow-y-auto">
      {inspectCase && (
        <div className="space-y-6">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h2 id="evidence-title" className="text-2xl font-bold text-slate-900">Verification Evidence Audit</h2>
              <p className="text-sm text-slate-500 mt-1">Case ID: <code>{String(inspectCase.id)}</code> · Status: <strong>{String(inspectCase.status)}</strong> · Score: <strong>{String(inspectCase.score)}%</strong></p>
            </div>
            <button className={button} onClick={() => setInspectCase(null)}>Close</button>
          </div>

          {evidenceLoading ? (
            <p className="py-12 text-center text-slate-600">Loading decrypted evidence bundle…</p>
          ) : evidenceError ? (
            <p role="alert" className="p-4 rounded-lg bg-red-50 text-red-800">{evidenceError}</p>
          ) : evidence ? (
            <div className="space-y-6 text-sm">
              {decisionNotice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-800">{decisionNotice}</p>}

              {/* Identity Records */}
              <div className="border rounded-xl p-4 bg-white">
                <h3 className="font-bold text-base text-slate-900 mb-2">1. Identity Comparison</h3>
                {evidence.identity.length === 0 ? <p className="text-slate-500">No identity submitted yet.</p> : (
                  <div className="space-y-3">
                    {evidence.identity.map((idRec) => (
                      <div key={idRec.id} className="p-3 rounded-lg bg-slate-50 border space-y-1">
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-800">Status: {idRec.status}</span>
                          <span className="text-xs text-slate-500">Subject: {idRec.subject_type}</span>
                        </div>
                        <p>BVN Name: <strong>{idRec.name_bvn || '—'}</strong></p>
                        <p>NIN Name: <strong>{idRec.name_nin || '—'}</strong></p>
                        <p>Name Match Score: <strong>{idRec.name_match_score !== null && idRec.name_match_score !== undefined ? `${(idRec.name_match_score * 100).toFixed(0)}%` : '—'}</strong></p>
                        <p>DOB Match: <strong>{idRec.dob_match === true ? 'Yes' : idRec.dob_match === false ? 'No match' : '—'}</strong> · Phone Match: <strong>{idRec.phone_match === true ? 'Yes' : idRec.phone_match === false ? 'No match' : '—'}</strong></p>
                        {idRec.duplicate_review_required && <p className="text-red-700 font-semibold">Flag: Potential duplicate identity detected on platform.</p>}
                        {idRec.reference_photo_available && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">NIN Reference Photo Available</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Liveness Checks */}
              <div className="border rounded-xl p-4 bg-white">
                <h3 className="font-bold text-base text-slate-900 mb-2">2. Liveness & Selfie Comparison</h3>
                {evidence.liveness.length === 0 ? <p className="text-slate-500">No selfie uploaded.</p> : (
                  <div className="space-y-4">
                    {evidence.liveness.map((chk) => (
                      <div key={chk.id} className="p-3 rounded-lg bg-slate-50 border flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          {chk.selfie_url ? (
                            <img src={chk.selfie_url} alt="Selfie" className="w-20 h-20 rounded-lg object-cover border" />
                          ) : <span className="text-slate-400">No image URL</span>}
                          <div>
                            <p className="font-semibold">Status: {chk.status}</p>
                            <p className="text-xs text-slate-500">Check ID: {chk.id}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={decisionBusy} className={`${button} !bg-emerald-700 !text-white text-xs`} onClick={() => void recordLivenessDecision(chk.id, 'passed')}>Pass</button>
                          <button disabled={decisionBusy} className={`${button} !bg-amber-600 !text-white text-xs`} onClick={() => void recordLivenessDecision(chk.id, 'manual_review')}>Review</button>
                          <button disabled={decisionBusy} className={`${button} !bg-red-700 !text-white text-xs`} onClick={() => void recordLivenessDecision(chk.id, 'failed')}>Fail</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Employment Records */}
              <div className="border rounded-xl p-4 bg-white">
                <h3 className="font-bold text-base text-slate-900 mb-2">3. Employment & Income Proof</h3>
                {evidence.employment.length === 0 ? <p className="text-slate-500">No employment records.</p> : (
                  <div className="space-y-3">
                    {evidence.employment.map((emp) => (
                      <div key={emp.id} className="p-3 rounded-lg bg-slate-50 border space-y-1">
                        <p>Employer: <strong>{emp.employer_name || '—'}</strong> · Role: <strong>{emp.job_title || '—'}</strong> ({emp.employment_type})</p>
                        <p>Declared Monthly Income: <strong>{emp.monthly_income_kobo ? money(emp.monthly_income_kobo) : '—'}</strong></p>
                        <p>Status: <strong className="capitalize">{emp.verification_status || 'unverified'}</strong></p>
                        {emp.document_url && (
                          <p><a href={emp.document_url} target="_blank" rel="noreferrer" className="text-blue-700 underline font-semibold">View / Download Pay Document</a></p>
                        )}
                        <div className="pt-2 flex gap-2">
                          <button disabled={decisionBusy} className={`${button} !bg-emerald-700 !text-white text-xs`} onClick={() => void recordEmploymentDecision('verified')}>Verify Employment</button>
                          <button disabled={decisionBusy} className={`${button} !bg-red-700 !text-white text-xs`} onClick={() => void recordEmploymentDecision('failed')}>Reject Document</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Address Records */}
              <div className="border rounded-xl p-4 bg-white">
                <h3 className="font-bold text-base text-slate-900 mb-2">4. Residential Address</h3>
                {evidence.address.length === 0 ? <p className="text-slate-500">No address proof submitted.</p> : (
                  <div className="space-y-3">
                    {evidence.address.map((addr) => (
                      <div key={addr.id} className="p-3 rounded-lg bg-slate-50 border space-y-1">
                        <p>Address: <strong>{addr.address_text || '—'}</strong></p>
                        <p>Proof Type: <strong>{addr.proof_type}</strong> · Status: <strong>{addr.verification_status}</strong></p>
                        {addr.proof_url && (
                          <p><a href={addr.proof_url} target="_blank" rel="noreferrer" className="text-blue-700 underline font-semibold">View Address Document</a></p>
                        )}
                        <div className="pt-2 flex gap-2">
                          <button disabled={decisionBusy} className={`${button} !bg-emerald-700 !text-white text-xs`} onClick={() => void recordAddressDecision(addr.id, 'verified')}>Verify Address</button>
                          <button disabled={decisionBusy} className={`${button} !bg-red-700 !text-white text-xs`} onClick={() => void recordAddressDecision(addr.id, 'failed')}>Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Final Decision Form */}
              <form onSubmit={recordFinalDecision} className="border-t pt-4 space-y-3 bg-slate-50 p-4 rounded-xl">
                <h3 className="font-bold text-base text-slate-900">Record Final Case Review Decision</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="radio" name="finalRes" value="pass" checked={finalDecision === 'pass'} onChange={() => setFinalDecision('pass')} /> Pass
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-amber-800">
                    <input type="radio" name="finalRes" value="review" checked={finalDecision === 'review'} onChange={() => setFinalDecision('review')} /> Needs Review
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-red-800">
                    <input type="radio" name="finalRes" value="fail" checked={finalDecision === 'fail'} onChange={() => setFinalDecision('fail')} /> Fail
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audited Decision Reason (min 10 characters)</label>
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={2}
                    value={finalReason}
                    onChange={e => setFinalReason(e.target.value)}
                    placeholder="State reason for overall verification eligibility assessment..."
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <Button type="submit" loading={decisionBusy} disabled={finalReason.trim().length < 10} className="w-full !bg-blue-800 !text-white font-bold py-2.5 rounded-xl">
                  Submit Final Decision
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </dialog>
  </main>;
}
