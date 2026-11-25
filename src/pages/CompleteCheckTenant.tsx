import { FormEvent, useEffect, useState } from 'react';
import { Brand, Button, Card, Input, Toast } from '../components/mvp-ui';
import { formatScreeningError, screeningApi } from '../lib/screeningApi';

type Progress =
  | { state: 'consent' | 'identity' | 'otp_code' | 'awaiting_video' | 'needs_review' | 'submitted' }
  | { state: 'otp_method'; methods: string[] };

export default function CompleteCheckTenant({ token, property }: { token: string; property: string }) {
  const base = `/api/public/screenings/${encodeURIComponent(token)}/interswitch`;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setProgress(null);
    setAgreed(false);
    setError('');
    void screeningApi<Progress>(base, { signal: controller.signal }, false)
      .then(result => { if (!controller.signal.aborted) setProgress(result); })
      .catch(err => { if (!controller.signal.aborted) setError(formatScreeningError(err)); });
    return () => controller.abort();
  }, [base]);

  async function submit(event: FormEvent<HTMLFormElement>, step: string, extra?: Record<string, boolean>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const body = extra ?? Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    try {
      setProgress(await screeningApi<Progress>(`${base}/${step}`, { method: 'POST', body: JSON.stringify(body) }, false));
      form.reset();
    } catch (err) {
      setError(formatScreeningError(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const file = new FormData(event.currentTarget).get('video');
    if (!(file instanceof File) || file.type !== 'video/mp4' || !file.size || file.size > 5 * 1024 * 1024) {
      setError('Choose an MP4 video of 5 MB or less.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setProgress(await screeningApi<Progress>(`${base}/video`, {
        method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: file,
      }, false));
    } catch (err) {
      setError(formatScreeningError(err));
    } finally {
      setBusy(false);
    }
  }

  return <main className="tt-tenant-page"><div className="tt-tenant-wrap">
    <header className="tt-tenant-header"><Brand /></header>
    <Card>
      <p className="tt-eyebrow">Complete Check sandbox</p>
      <h1>{property}</h1>
      <p>Use sample details only. This is a test screening.</p>
      {error && <Toast>{error}</Toast>}
      {!progress && !error && <p role="status">Loading your screening.</p>}
      {progress?.state === 'consent' && <form className="tt-form" onSubmit={event => void submit(event, 'consent', { agreed })}>
        <h2>Agree to the checks</h2>
        <p>TenTrust uses Interswitch to check sample BVN and NIN details and look up sample loan history.</p>
        <label className="tt-check-label"><input type="checkbox" required checked={agreed} onChange={event => setAgreed(event.target.checked)} /> I agree to these test checks.</label>
        <Button type="submit" loading={busy} disabled={!agreed}>Agree and continue</Button>
      </form>}
      {progress?.state === 'identity' && <form className="tt-form" onSubmit={event => void submit(event, 'identity')}>
        <h2>Enter the sample ID details</h2>
        <Input id="complete-first" name="first_name" label="First name" required maxLength={80} />
        <Input id="complete-last" name="last_name" label="Last name" required maxLength={80} />
        <Input id="complete-dob" name="date_of_birth" label="Date of birth" type="date" required />
        <Input id="complete-nin" name="nin" label="Sample NIN" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required />
        <Input id="complete-bvn" name="bvn" label="Sample BVN" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required />
        <Button type="submit" loading={busy}>Check sample identity</Button>
      </form>}
      {progress?.state === 'otp_method' && <form className="tt-form" onSubmit={event => void submit(event, 'otp/send')}>
        <h2>Choose how to get the test code</h2>
        <label htmlFor="complete-method">Code delivery</label>
        <select id="complete-method" name="method" required defaultValue="">
          <option value="" disabled>Select a method</option>
          {progress.methods.map(method => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}
        </select>
        <Button type="submit" loading={busy}>Send test code</Button>
      </form>}
      {progress?.state === 'otp_code' && <form className="tt-form" onSubmit={event => void submit(event, 'otp/verify')}>
        <h2>Enter the test code</h2>
        <Input id="complete-otp" name="otp" label="Test code" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} required />
        <Button type="submit" loading={busy}>Confirm code and check loan history</Button>
      </form>}
      {progress?.state === 'needs_review' && <p role="status">The sample identity did not match. This case needs staff review.</p>}
      {progress?.state === 'awaiting_video' && <form className="tt-form" onSubmit={uploadVideo}>
        <h2>Submit a sample video</h2>
        <p>Choose an MP4 file of 5 MB or less. Only TenTrust staff can view the video.</p>
        <Input id="complete-video" name="video" label="Sample video" type="file" accept="video/mp4" required />
        <Button type="submit" loading={busy}>Send for staff review</Button>
      </form>}
      {progress?.state === 'submitted' && <p role="status">Checks complete. Your sample report is awaiting staff review.</p>}
    </Card>
  </div></main>;
}
