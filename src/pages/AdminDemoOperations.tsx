import ScreeningEvidenceReview from '../components/ScreeningEvidenceReview';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { screeningApi } from '../lib/screeningApi';
import { Button, Card, Container, Logo } from '../components/mvp-ui';

type Resource = 'payments' | 'screenings' | 'users' | 'emails' | 'quotes';
type Row = Record<string, string | number | boolean | null>;
const columns: Record<Resource, string[]> = {
  quotes: ['landlord_id', 'checks', 'monthly_rent', 'notes', 'created_at'],
  payments: ['reference', 'amount_kobo', 'mode', 'status', 'created_at'],
  screenings: ['tenant_name', 'package_id', 'status', 'payment_status', 'created_at'],
  users: ['email', 'first_name', 'status', 'created_at'],
  emails: ['recipient', 'kind', 'state', 'created_at'],
};
function display(key: string, value: Row[string]) {
  if (value === null || value === undefined) return '—';
  if (key === 'amount_kobo') return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value) / 100);
  if (key.endsWith('_at')) return new Date(String(value)).toLocaleString();
  return String(value).replaceAll('_', ' ');
}

export default function AdminDemoOperations() {
  const [reviewId,setReviewId]=useState('');
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState('');
  const [resource, setResource] = useState<Resource>('payments');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void screeningApi<{ email: string }>('/api/admin/me').then(me => {
      if (active) { setAllowed(true); setEmail(me.email); }
    }).catch(() => { if (active) { setError('Sign in with a confirmed account that has administrator membership.'); setBusy(false); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!allowed) return;
    let active = true; setBusy(true); setError(''); setRows([]);
    void screeningApi<{ items: Row[]; has_more: boolean }>(`/api/admin/${resource}?page=${page}&limit=25`).then(data => {
      if (active) { setRows(data.items); setMore(data.has_more); }
    }).catch(() => { if (active) { setRows([]); setMore(false); setError('Records could not be loaded. Refresh to try again.'); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [allowed, resource, page, revision]);
  return <main className="tt-app" style={{ minHeight: '100vh', padding: '28px 0' }}><Container>
    <header className="site-operations-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}><Link to="/"><Logo /></Link><Link to="/dashboard">Landlord dashboard</Link></header>
    <h1 style={{ marginTop: 36 }}>Operations</h1><p className="tt-muted">{allowed ? email : 'Checking access…'}</p>
    {error && <p role="alert">{error} <Link to="/auth">Sign in</Link></p>}
    {allowed && <><nav aria-label="Operations records" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0' }}>{(Object.keys(columns) as Resource[]).map(key => <Button key={key} kind={resource === key ? 'primary' : 'secondary'} onClick={() => { setResource(key); setPage(1); }}>{key.charAt(0).toUpperCase() + key.slice(1)}</Button>)}<Button kind="secondary" onClick={() => setRevision(value => value + 1)}>Refresh</Button></nav>
      <Card><div style={{ overflowX: 'auto' }}>{busy ? <p role="status">Loading records…</p> : rows.length === 0 ? <p>No records to display.</p> : <table style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'left', fontSize: 14 }}><thead><tr>{columns[resource].map(key => <th style={{ padding: 12, borderBottom: '1px solid #dce3ed' }} key={key} scope="col">{key.replaceAll('_', ' ')}</th>)}{resource==='screenings'&&<th scope="col">Staff review</th>}</tr></thead><tbody>{rows.map(row => <tr key={String(row.id)}>{columns[resource].map(key => <td key={key} style={{ padding: 12, borderBottom: '1px solid #edf0f5', overflowWrap: 'anywhere' }}>{display(key, row[key])}</td>)}{resource==='screenings'&&<td><Button kind="secondary" onClick={()=>setReviewId(String(row.id))}>Review evidence</Button></td>}</tr>)}</tbody></table>}</div></Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}><Button kind="secondary" disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page}</span><Button kind="secondary" disabled={busy || !more} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      {reviewId&&resource==='screenings'&&<ScreeningEvidenceReview key={reviewId} screeningId={reviewId}/>}
    </>}
  </Container></main>;
}
