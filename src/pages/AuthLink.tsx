import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { initialAuthLinkHasToken, initialAuthLinkType, supabase } from '../lib/supabase';
import { Logo } from '../components/mvp-ui';
import { verifyAuthLink } from '../lib/verifyAuthLink';
import { authLinkReturnTo } from '../lib/authLinks';

export default function AuthLink() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const recovery = pathname === '/auth/reset-password';
  const returnTo = useRef(authLinkReturnTo(window.location.href, window.location.origin));
  const signInPath = '/auth' + (returnTo.current ? '?' + new URLSearchParams({returnTo:returnTo.current}) : '');
  const verification = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<'checking' | 'ready' | 'error' | 'saved'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!verification.current) verification.current = (async () => {
      await verifyAuthLink(supabase, window.location.href, recovery,
        { hasToken: initialAuthLinkHasToken, type: initialAuthLinkType });
      window.history.replaceState(null, '', pathname + (returnTo.current ? '?' + new URLSearchParams({returnTo:returnTo.current}) : ''));
    })();
    void verification.current.then(() => {
      if (!active) return;
      setState('ready');
      if (!recovery) navigate(signInPath, { replace: true });
    }).catch(() => {
      if (active) { setState('error'); setMessage('This email link is invalid or expired. Request a fresh link from the sign-in page.'); }
    });
    return () => { active = false; };
  }, [navigate, pathname, recovery]);

  async function save(event: FormEvent) {
    event.preventDefault(); setMessage('');
    if (password.length < 8) { setMessage('Use at least 8 characters.'); return; }
    if (password !== confirm) { setMessage('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut(); setState('saved'); setPassword(''); setConfirm('');
    } catch { setMessage('The password could not be saved. Try again or request a fresh recovery link.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900"><section className="mx-auto max-w-md rounded-2xl border bg-white p-7 shadow-sm">
    <Link to="/" aria-label="TenTrust home"><Logo /></Link>
    <h1 className="my-6 text-2xl font-bold">{recovery ? 'Choose a new password' : 'Confirming your email'}</h1>
    {state === 'checking' && <p role="status">Checking your email link…</p>}
    {message && <p role="alert" className="mb-5 text-red-800">{message}</p>}
    {state === 'ready' && recovery && <form onSubmit={save} className="space-y-5">
      <label className="block">New password<input className="mt-2 min-h-11 w-full rounded-lg border p-3 focus-visible:outline-2 focus-visible:outline-blue-700" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="block">Confirm password<input className="mt-2 min-h-11 w-full rounded-lg border p-3 focus-visible:outline-2 focus-visible:outline-blue-700" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button disabled={busy} className="min-h-11 w-full rounded-lg bg-blue-800 p-3 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save new password'}</button>
    </form>}
    {state === 'saved' && <p role="status">Password saved. Sign in with your new password.</p>}
    {(state === 'saved' || state === 'error') && <Link className="mt-6 inline-flex min-h-11 items-center font-bold text-blue-800 underline" to={signInPath}>Return to sign in</Link>}
  </section></main>;
}
