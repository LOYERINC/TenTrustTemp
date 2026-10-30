import { FormEvent, useEffect, useRef, useState } from 'react';
import { Brand, Button, Card, Input, Toast } from '../components/mvp-ui';
import { useServiceMode } from '../context/ServiceModeContext';
import { CheckCircle2, Lock, UploadCloud } from '../lib/icons';
import { SCREENING_API_BASE, screeningApi, formatScreeningError } from '../lib/screeningApi';

interface Steps { verification_mode?: "manual" | "mono"; identity_done: boolean; statement_required: boolean; challenge: string; liveness_uploaded: boolean; statement_uploaded: boolean; }
export default function ScreeningTenantFlow({ token, landlord, property, intermediate }: { token: string; landlord: string; property: string; intermediate: boolean }) {
  const { sandbox } = useServiceMode();
  const base = `/api/public/screenings/${encodeURIComponent(token)}`;
  const [steps, setSteps] = useState<Steps|null>(null);
  const [consent, setConsent] = useState(false), [agreed, setAgreed] = useState(false);
  const [fullName,setFullName]=useState('');
  const manual=steps?.verification_mode==='manual';
  const [bvn, setBvn] = useState(''), [nin, setNin] = useState(''), [dob, setDob] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [progress, setProgress] = useState<number|null>(null), [showUpload, setShowUpload] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), xhr = useRef<XMLHttpRequest|null>(null);
  useEffect(() => { let active = true; void screeningApi<Steps>(`${base}/steps`, {}, false).then(value => { if(active) setSteps(value); }).catch(e => { if(active) setError(formatScreeningError(e)); }); return () => { active=false; xhr.current?.abort(); }; }, [base]);
  async function agree() { setBusy(true); setError(''); try { await screeningApi(`${base}/consent`, {method:'POST',body:JSON.stringify({consent:true})},false); setAgreed(true); } catch(e) { setError(formatScreeningError(e)); } finally { setBusy(false); } }
  async function identity(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await screeningApi(`${base}/steps/identity`, {method:'POST',body:JSON.stringify({full_name:fullName,bvn,nin,date_of_birth:dob})},false); setSteps(s => s && {...s,identity_done:true}); setNin(''); setDob(''); setFullName(''); if(manual)setBvn(''); } catch(e) { setError(formatScreeningError(e)); } finally { setBusy(false); } }
  function upload(file: File|undefined, kind: 'liveness'|'statement') {
    if(!file) return; setError('');
    if(file.size > 10*1024*1024 || !file.size) { setError('Choose a file that is 10 MB or less.'); return; }
    if(kind === 'statement' && (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name))) { setError('Choose a PDF file only.'); return; }
    if(kind === 'liveness' && !['video/webm','video/mp4'].includes(file.type)) { setError('Choose an MP4 or WebM video.'); return; }
    setBusy(true); setProgress(0); const request = new XMLHttpRequest(); xhr.current=request;
    request.open('PUT', `${SCREENING_API_BASE}${base}/steps/evidence/${kind}`); request.setRequestHeader('Content-Type',file.type); request.timeout=120000;
    request.upload.onprogress = event => { if(event.lengthComputable) setProgress(Math.round(event.loaded/event.total*100)); };
    request.onload = () => { if(request.status >=200 && request.status<300) setSteps(s => s && {...s,[kind === 'statement' ? 'statement_uploaded' : 'liveness_uploaded']:true}); else { let message='Upload failed. Please try again.'; try { const body=JSON.parse(request.responseText); if(typeof body.detail==='string') message=body.detail; } catch {} setError(message); } setBusy(false); setProgress(null); };
    request.onerror=request.ontimeout=() => {setError('Upload failed. Check your connection and try again.');setBusy(false);setProgress(null);}; request.send(file);
  }
  async function finish() { if(!steps?.liveness_uploaded || (steps.statement_required && !steps.statement_uploaded)) {setError('Upload all required files before you continue.');return;} setBusy(true);setError(''); try {await screeningApi(`${base}/steps/submit`,{method:'POST',body:JSON.stringify(intermediate?{bvn}:{})},false);setBvn('');setDone(true);}catch(e){setError(formatScreeningError(e));}finally{setBusy(false);} }
  return <main className="tt-tenant-page"><div className="tt-tenant-wrap"><header className="tt-tenant-header"><Brand/><span><Lock size={16}/> Private screening</span></header>
    {error && <Toast>{error}</Toast>}
    {!steps && error && <Button kind="secondary" onClick={()=>window.location.reload()}>Try again</Button>}
    {!steps && !error && <Card><p role="status">Loading your private screening…</p></Card>}
    {done ? <Card><CheckCircle2 size={36}/><h1>Your checks are sent</h1><p>Our team will review your submitted details and liveness video{steps?.statement_required?' and bank statement':''}. Your landlord gets only the screening result.</p></Card> : steps && <Card>
      <p className="tt-eyebrow">{intermediate?'Intermediate':'Basic'} screening · {property}</p>
      {!agreed ? <><h1>{landlord} has asked for a tenant check</h1><p>{manual ? "Our team will review the name, ID numbers, date of birth and video you send." : <>We check your BVN, NIN, and liveness{intermediate?', plus your credit history':''}.</>} Your landlord sees the final report, not your ID numbers, video, or bank statement.</p>{steps.statement_required && <p>As the monthly rent is over ₦500,000, we also need your last 3 months of bank statements for the credit check. Staff review them to assess affordability.</p>}<label className="tt-check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree to these checks and the use of my details for this screening.</label><Button disabled={!consent} loading={busy} onClick={()=>void agree()}>Agree and continue</Button></> : !steps.identity_done ? <><h1>{manual?"Send your ID details":"Check your ID"}</h1>{sandbox && <div className="tt-consent-card"><p>Test mode: use sample details only. Do not upload a real bank statement or a real person’s video for this test.</p><Button kind="secondary" onClick={()=>{setBvn('22227777222');setNin('12345678901');setDob('1991-09-01');}}>Use sample ID details</Button></div>}<p>Full ID numbers stay out of your landlord’s report.</p><form className="tt-form" onSubmit={identity}>{manual&&<Input id="v2-full-name" label="Full name" required maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)}/>}<Input id="v2-bvn" label="BVN (11 digits)" type="password" inputMode="numeric" required pattern="[0-9]{11}" maxLength={11} value={bvn} onChange={e=>setBvn(e.target.value.replace(/\D/g,''))}/><Input id="v2-nin" label="NIN (11 digits)" type="password" inputMode="numeric" required pattern="[0-9]{11}" maxLength={11} value={nin} onChange={e=>setNin(e.target.value.replace(/\D/g,''))}/><Input id="v2-dob" label="Date of birth" type="date" required value={dob} max={new Date().toISOString().slice(0,10)} onChange={e=>setDob(e.target.value)}/><Button type="submit" loading={busy}>{manual?"Send details for staff review":"Check my ID"}</Button></form></> : <>
      <h1>{!steps.liveness_uploaded?'Liveness check':'Finish your screening'}</h1>
      {!steps.liveness_uploaded ? <><p>Record a short video of your face. Say <strong>{steps.challenge}</strong>, then turn your head left and right. Our staff will review it. Your landlord cannot see it.</p><label className="evidence-upload"><UploadCloud size={24}/>Upload liveness video<input type="file" accept="video/mp4,video/webm" capture="user" disabled={busy} onChange={e=>{upload(e.target.files?.[0],'liveness');e.target.value='';}}/></label><small>MP4 or WebM only · up to 10 MB</small></> : <p role="status">✓ Liveness video uploaded. Staff review is pending.</p>}
      {steps.liveness_uploaded && steps.statement_required && !steps.statement_uploaded && <section><h2>3-month bank statement</h2>{!showUpload ? <Button kind="secondary" onClick={()=>dialog.current?.showModal()}>Continue to bank statement</Button> : <><p>Your statement is private. Only our staff can access it. Include the last 3 months in one PDF.</p><label className="evidence-upload">Choose statement PDF<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{upload(e.target.files?.[0],'statement');e.target.value='';}}/></label><small>PDF only · up to 10 MB · no password</small></>}</section>}
      {steps.statement_required && steps.statement_uploaded && <p role="status">✓ Bank statement uploaded. Your landlord cannot see this file.</p>}
      {intermediate && !bvn && <Input id="credit-bvn" label="Enter the same BVN again for your credit check" type="password" inputMode="numeric" maxLength={11} value={bvn} onChange={e=>setBvn(e.target.value.replace(/\D/g,''))}/>}
      {progress !== null && <div role="status"><progress value={progress} max={100}/><p>{progress===100?'Saving securely…':`Uploading… ${progress}%`}</p></div>}
      <Button loading={busy} disabled={!steps.liveness_uploaded || (steps.statement_required && !steps.statement_uploaded) || (intermediate && bvn.length!==11)} onClick={()=>void finish()}>{intermediate?'Run credit check and send':'Send for review'}</Button>
      </>}
    </Card>}
    <dialog ref={dialog} className="statement-privacy-dialog" aria-labelledby="statement-privacy-title"><h2 id="statement-privacy-title">Your bank statement is private</h2><p>To complete your credit check, please upload your last 3 months of bank statements. Your landlord will not see this document. We process it securely to assess affordability, and the landlord only receives the final screening result.</p><div className="statement-dialog-actions"><Button onClick={()=>{setShowUpload(true);dialog.current?.close();}}>Upload statement</Button><Button kind="secondary" onClick={()=>dialog.current?.close()}>Cancel</Button></div></dialog>
  </div></main>;
}
