import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, ShieldCheck } from '../lib/icons';
import { Brand, Button, Card, ConsentCard, Input, StepIndicator, Toast, VerifiedBadge } from '../components/mvp-ui';
import { formatScreeningError, screeningApi } from '../lib/screeningApi';

interface PublicRequest { tenant_name:string; property_title:string; landlord_name:string; }

export default function TenantVerificationPortal(){
  const {token=''}=useParams<{token:string}>();
  const [request,setRequest]=useState<PublicRequest|null>(null);const [step,setStep]=useState<1|2>(1);const [consent,setConsent]=useState(false);
  const [docType,setDocType]=useState<'bvn'|'nin'>('bvn');const [document,setDocument]=useState('');const [dob,setDob]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);const [nameMatch,setNameMatch]=useState('');
  useEffect(()=>{if(!token){setError('This link is not valid. Ask your landlord for a new one.');setLoading(false);return;}screeningApi<PublicRequest>(`/api/public/screenings/${encodeURIComponent(token)}`,{},false).then(setRequest).catch(e=>setError(formatScreeningError(e))).finally(()=>setLoading(false));},[token]);
  const consentNext=async()=>{setBusy(true);setError('');try{await screeningApi(`/api/public/screenings/${encodeURIComponent(token)}/consent`,{method:'POST',body:JSON.stringify({consent:true})},false);setStep(2);}catch(e){setError(formatScreeningError(e));}finally{setBusy(false);}};
  const submit=async(e:FormEvent)=>{e.preventDefault();setError('');if(!/^\d{11}$/.test(document)){setError(`That ${docType.toUpperCase()} doesn't look right. Check the 11 digits and try again.`);return;}if(!dob){setError('Enter your date of birth to continue.');return;}setBusy(true);try{const response=await screeningApi<{name_match:string}>(`/api/public/screenings/${encodeURIComponent(token)}/identity`,{method:'POST',body:JSON.stringify({document_type:docType,document_number:document,date_of_birth:dob})},false);setNameMatch(response.name_match);setDocument('');setDob('');setDone(true);}catch(error){setDocument('');setError(formatScreeningError(error));}finally{setBusy(false);}};
  return <main className="tt-tenant-page"><div className="tt-tenant-wrap"><header className="tt-tenant-header"><Brand/><span className="tt-secured"><Lock size={15}/> Secured</span></header>
    {!done&&!error&&!loading&&request&&<StepIndicator step={step}/>}
    {loading?<Card><div className="tt-skeleton-list"><span className="tt-skeleton"/><span className="tt-skeleton"/></div><p className="sr-only" role="status">Opening your secure link…</p></Card>:error&&!request?<Card><Toast>{error}</Toast><p className="tt-muted">If you need help, contact the person who sent this link.</p></Card>:error&&request?<div style={{marginBottom:12}}><Toast>{error}</Toast></div>:null}
    {request&&!done&&<Card>
      {step===1?<><h1 style={{fontSize:26,lineHeight:1.2,margin:'0 0 9px'}}>{request.landlord_name} has asked you to verify your identity</h1><p className="tt-muted">For {request.property_title}. This should take about a minute.</p><h2 style={{fontSize:18,margin:'22px 0 7px'}}>What we’ll check</h2><ul className="tt-consent-list"><li>We’ll check your BVN or NIN and date of birth with Mono.</li><li>Your landlord will see whether your identity was verified and if your name matched.</li><li>Your landlord will not see your BVN, NIN or date of birth.</li><li>Your ID number is not kept after the check.</li></ul><ConsentCard><label className="tt-check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I agree to this identity check and allow TenTrust to send my details to Mono for verification.</span></label></ConsentCard><div style={{marginTop:17}}><Button className="tt-full" onClick={()=>void consentNext()} loading={busy} disabled={!consent}>Continue</Button></div></>:
      <><h1 style={{fontSize:26,lineHeight:1.2,margin:'0 0 8px'}}>Verify your identity</h1><p className="tt-muted" style={{marginTop:0}}>Your details are sent securely for this check only.</p><form className="tt-form" onSubmit={submit}>
        <div className="tt-field"><label>Choose an ID</label><div className="tt-id-toggle" role="group" aria-label="ID type"><button type="button" className={docType==='bvn'?'is-selected':''} aria-pressed={docType==='bvn'} onClick={()=>{setDocType('bvn');setDocument('');}}>BVN</button><button type="button" className={docType==='nin'?'is-selected':''} aria-pressed={docType==='nin'} onClick={()=>{setDocType('nin');setDocument('');}}>NIN</button></div></div>
        <Input id="id-number" label={`${docType.toUpperCase()} (11 digits)`} type="password" inputMode="numeric" autoComplete="off" maxLength={11} pattern="[0-9]{11}" required value={document} onChange={e=>setDocument(e.target.value.replace(/\D/g,'').slice(0,11))} helper="We only use this to confirm your identity. It is not saved."/>
        <Input id="date-of-birth" label="Date of birth" type="date" autoComplete="bday" required value={dob} max={new Date().toISOString().slice(0,10)} onChange={e=>setDob(e.target.value)} helper="Enter the date on your ID record."/>
        {error&&<Toast>{error}</Toast>}<Button type="submit" loading={busy} disabled={document.length!==11||!dob}><ShieldCheck size={19}/> Verify my identity</Button>
      </form></>}
    </Card>}
    {done&&<Card><div className="tt-result"><VerifiedBadge verified/><h2>Thanks, your landlord has been notified.</h2><p>Your identity check is complete. You can close this page.</p></div>{nameMatch!=='match'&&<div className="tt-name-flag">Your landlord may ask you to confirm a detail. No action is needed here.</div>}</Card>}
    <p className="tt-muted" style={{fontSize:13,textAlign:'center',marginTop:16}}>TenTrust will never show your raw BVN or NIN to your landlord.</p>
  </div></main>;
}
