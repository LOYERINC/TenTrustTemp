import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, ShieldCheck } from '../lib/icons';
import { Brand, Button, Card, ConsentCard, Input, StepIndicator, Toast, VerifiedBadge } from '../components/mvp-ui';
import { formatScreeningError, screeningApi } from '../lib/screeningApi';
import { useServiceMode } from '../context/ServiceModeContext';

interface PublicRequest { tenant_name: string; property_title: string; landlord_name: string; }

export default function SandboxTenantPortal() {
  const { sandbox, ready } = useServiceMode();
  const { token = '' } = useParams<{ token: string }>();
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [consent, setConsent] = useState(false);
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; name_match: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    setRequest(null); setResult(null); setLoading(true); setError('');
    if (!token) { setError('This link is not valid. Ask your landlord for a new one.'); setLoading(false); return; }
    void screeningApi<PublicRequest>(`/api/public/screenings/${encodeURIComponent(token)}`, {}, false)
      .then(value => { if (active) setRequest(value); })
      .catch(err => { if (active) setError(formatScreeningError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function consentNext() {
    setBusy(true); setError('');
    try {
      await screeningApi(`/api/public/screenings/${encodeURIComponent(token)}/consent`, { method: 'POST', body: JSON.stringify({ consent: true }) }, false);
      setStep(2);
    } catch (err) { setError(formatScreeningError(err)); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!ready) { setError('Refresh this page to confirm the verification service mode before continuing.'); return; }
    if (!/^\d{11}$/.test(bvn) || !/^\d{11}$/.test(nin) || !dob) { setError('Enter both 11-digit identifiers and the date of birth.'); return; }
    setBusy(true);
    try {
      const value = await screeningApi<{ status: string; name_match: string | null }>(`/api/public/screenings/${encodeURIComponent(token)}/identity`, {
        method: 'POST', body: JSON.stringify({ document_type: 'bvn', document_number: bvn, bvn, nin, date_of_birth: dob }),
      }, false);
      setResult(value);
    } catch (err) { setError(formatScreeningError(err)); }
    finally { setBvn(''); setNin(''); setDob(''); setBusy(false); }
  }

  return <main className="tt-tenant-page"><div className="tt-tenant-wrap">
    <header className="tt-tenant-header"><Brand /><span className="tt-secured"><Lock size={15} /> Secured</span></header>
    {!result && !loading && request && <StepIndicator step={step} />}
    {loading && <Card><p role="status">Opening your secure link…</p></Card>}
    {error && <div style={{ marginBottom: 12 }}><Toast>{error}</Toast></div>}
    {request && !result && <Card>{step === 1 ? <>
      <h1 style={{ fontSize: 26, lineHeight: 1.2 }}>{request.landlord_name} has asked you to verify your identity</h1>
      <p className="tt-muted">For {request.property_title}.</p>
      <h2 style={{ fontSize: 18, marginTop: 22 }}>What we’ll check</h2>
      <ul className="tt-consent-list"><li>Both BVN and NIN, together with date of birth, are checked with Mono.</li><li>Your landlord sees the check result and name-match status.</li><li>Your landlord does not see either identifier or your date of birth.</li><li>Raw identifiers are used for this request and are not saved in the report.</li></ul>
      {sandbox && <p className="tt-name-flag">This is a Sandbox demonstration. Use Mono’s published sample details only.</p>}
      <ConsentCard><label className="tt-check-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I agree to send these details to Mono for this identity check.</span></label></ConsentCard>
      <Button className="tt-full" style={{ marginTop: 17 }} onClick={() => void consentNext()} loading={busy} disabled={!consent || !ready}>Continue</Button>
    </> : <>
      <h1 style={{ fontSize: 26 }}>Verify your identity</h1>
      {sandbox && <div className="tt-consent-card"><p>Mono Sandbox: BVN <strong>22227777222</strong>, NIN <strong>12345678901</strong>, DOB <strong>1 September 1991</strong>.</p><Button kind="secondary" type="button" onClick={() => { setBvn('22227777222'); setNin('12345678901'); setDob('1991-09-01'); }}>Use Sandbox details</Button></div>}
      <form className="tt-form" onSubmit={submit}>
        <Input id="bvn" label="BVN (11 digits)" type="password" inputMode="numeric" autoComplete="off" maxLength={11} pattern="[0-9]{11}" required value={bvn} onChange={event => setBvn(event.target.value.replace(/\D/g, '').slice(0, 11))} />
        <Input id="nin" label="NIN (11 digits)" type="password" inputMode="numeric" autoComplete="off" maxLength={11} pattern="[0-9]{11}" required value={nin} onChange={event => setNin(event.target.value.replace(/\D/g, '').slice(0, 11))} />
        <Input id="dob" label="Date of birth" type="date" autoComplete="off" required value={dob} max={new Date().toISOString().slice(0, 10)} onChange={event => setDob(event.target.value)} />
        <Button type="submit" loading={busy} disabled={!ready || bvn.length !== 11 || nin.length !== 11 || !dob}><ShieldCheck size={19} /> Run {sandbox ? 'Sandbox ' : ''}identity check</Button>
      </form>
    </>}</Card>}
    {result && <Card><div className="tt-result"><VerifiedBadge verified={result.status === 'complete'} /><h2>{result.status === 'complete' ? `${sandbox ? 'Sandbox ' : ''}identity check complete` : 'Identity could not be verified'}</h2><p>The landlord can view the returned result in their dashboard.</p></div>{result.name_match && result.name_match !== 'match' && <p className="tt-name-flag">The submitted name did not match exactly. The report shows this for human review.</p>}{sandbox && <p className="tt-name-flag">Sample identity data only. This result does not verify a real person.</p>}</Card>}
    <p className="tt-muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 16 }}>TenTrust never shows your raw BVN or NIN to your landlord.</p>
  </div></main>;
}
