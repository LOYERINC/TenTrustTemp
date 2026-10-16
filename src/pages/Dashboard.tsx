import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock, FileText, LayoutDashboard, Plus, Search, UserRoundPlus, X } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { Button, Logo, Container, Card, Input, Skeleton, StatCard, StatusChip, Toast, VerifiedBadge } from '../components/mvp-ui';
import SampleReportCard from '../components/SampleReportCard';
import { siteConfig } from '../config';
import { formatScreeningError, screeningApi, ScreeningPackage } from '../lib/screeningApi';
import { redirectToPaymentCheckout } from '../lib/paymentCheckout';
import { tiers } from '../config/pricing.js';
import { formatNaira, toTitleCase } from '../utils/format.js';

interface RequestRow {
  id: string; tenant_name: string; tenant_phone: string; property_title: string; status: string; payment_status: string;
  created_at: string; package_id?: string; name_match?: string|null; identity_verified_at?: string|null; report_id?: string|null; masked_document?: string|null;
}
interface ReportRow extends RequestRow { check_status?: Record<string,string>; landlord_name?: string; }
type Filter = 'All'|'Pending'|'Completed';
const nigeriaPhone = /^(?:\+234|234|0)[789][01]\d{8}$/;

export default function Dashboard() {
  const { user, logout, isLoading: authLoading } = useAuth(); const navigate = useNavigate();
  const [rows,setRows]=useState<RequestRow[]>([]); const [packageCatalog,setPackageCatalog]=useState<ScreeningPackage[]>([]);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [filter,setFilter]=useState<Filter>('All'); const [createOpen,setCreateOpen]=useState(false); const [tenantLink,setTenantLink]=useState(''); const [paymentConfirming,setPaymentConfirming]=useState(false); const [tierStep,setTierStep]=useState(true);
  const [report,setReport]=useState<ReportRow|null>(null); const [fieldError,setFieldError]=useState(''); const [copied,setCopied]=useState(false);
  const [searchQuery,setSearchQuery]=useState(''); const [menuOpen,setMenuOpen]=useState(false); const [avatarOpen,setAvatarOpen]=useState(false); const [selectedTierId,setSelectedTierId]=useState('basic');
  const hasCompletedInitialLoad=useRef(false);
  const [sampleOpen,setSampleOpen]=useState(false); const sampleTriggerRef=useRef<HTMLButtonElement>(null); const sampleCloseRef=useRef<HTMLButtonElement>(null);

  const refresh=useCallback(async()=>{
    try {
      const [list,packages]=await Promise.all([
        screeningApi<{screenings:RequestRow[]}>('/api/screenings'),
        screeningApi<{packages:ScreeningPackage[]}>('/api/screenings/packages',{},false),
      ]);
      setRows(list.screenings||[]); setPackageCatalog(packages.packages||[]); setError('');
    } catch(e) { if(hasCompletedInitialLoad.current) setError(formatScreeningError(e)); }
    finally { setLoading(false); hasCompletedInitialLoad.current=true; }
  },[]);

  useEffect(()=>{ if(authLoading)return; if(!user){navigate('/auth');return;} void refresh(); },[user,authLoading,navigate,refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>void refresh(),20000);return()=>window.clearInterval(timer);},[refresh]);
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search); const id=query.get('screening'); const reference=query.get('reference')||query.get('trxref')||query.get('tx_ref');
    if(!id||!reference)return;
    let cancelled=false;
    setPaymentConfirming(true);
    void (async()=>{
      try {
        const result=await screeningApi<{tenant_url?:string;payment_status?:string}>(`/api/screenings/${encodeURIComponent(id)}/verify-payment?reference=${encodeURIComponent(reference)}`,{method:'POST'});
        if(cancelled)return;
        let link=result.tenant_url;
        if(!link&&result.payment_status==='paid'){
          const issued=await screeningApi<{tenant_url:string}>(`/api/screenings/${encodeURIComponent(id)}/tenant-link`,{method:'POST'});
          link=issued.tenant_url;
        }
        if(!link)throw new Error('Payment is confirmed, but the tenant link is not ready yet. Use “Get tenant link” from the request below to try again.');
        if(cancelled)return;
        setTenantLink(link);
        setPaymentConfirming(false);
        void refresh();
        const clean=new URL(window.location.href);clean.searchParams.delete('screening');clean.searchParams.delete('reference');clean.searchParams.delete('trxref');clean.searchParams.delete('tx_ref');clean.searchParams.delete('tab');window.history.replaceState({},'',clean);
      } catch(e) { if(!cancelled)setError(formatScreeningError(e)); }
      finally { if(!cancelled)setPaymentConfirming(false); }
    })();
    return ()=>{cancelled=true;};
  },[refresh]);
  useEffect(()=>{
    const reportId=new URLSearchParams(window.location.search).get('report');if(!reportId)return;
    let cancelled=false;setBusy(true);
    screeningApi<ReportRow>(`/api/screenings/${encodeURIComponent(reportId)}`).then(data=>{if(!cancelled)setReport(data);}).catch(e=>{if(!cancelled)setError(formatScreeningError(e));}).finally(()=>{if(!cancelled){setBusy(false);const clean=new URL(window.location.href);clean.searchParams.delete('report');clean.searchParams.delete('tab');window.history.replaceState({},'',clean);}});
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    if(!sampleOpen)return;
    const dialog=document.querySelector<HTMLElement>('.dashboard-sample-dialog');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')||[]);
    sampleCloseRef.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setSampleOpen(false);return;}
      if(event.key==='Tab'){
        const items=focusable();if(!items.length)return;const first=items[0];const last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);window.requestAnimationFrame(()=>sampleTriggerRef.current?.focus());};
  },[sampleOpen]);

  const filtered=useMemo(()=>rows.filter(row=>{
    const matchesFilter=filter==='All'||(filter==='Completed'?row.status==='complete':!['complete','declined','expired'].includes(row.status));
    const query=searchQuery.trim().toLowerCase();
    return matchesFilter&&(!query||`${row.tenant_name} ${row.property_title}`.toLowerCase().includes(query));
  }), [rows,filter,searchQuery]);
  const completed=rows.filter(row=>row.status==='complete').length; const pending=rows.filter(row=>!['complete','declined','expired'].includes(row.status)).length;
  const downloadReport=async(report:ReportRow)=>{const {downloadIdentityReport}=await import('../lib/pdfReport');downloadIdentityReport({...report,property_title:report.property_title});};

  const createRequest=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError('');setFieldError('');const form=new FormData(event.currentTarget);
    const name=String(form.get('tenant_name')||'').trim();const phone=String(form.get('tenant_phone')||'').replace(/[\s()-]/g,'');
    if(name.length<2){setFieldError('Enter the tenant’s full name.');return;}
    if(!nigeriaPhone.test(phone)){setFieldError('Enter a valid Nigerian mobile number, such as 08012345678.');return;}
    setBusy(true);
    try{
      const selectedTier=tiers.find(tier=>tier.id===selectedTierId)||tiers[0];
      // The tier and displayed quote travel with the request; checkout amount remains server-authoritative.
      const created=await screeningApi<{screening_id:string}>('/api/screenings',{method:'POST',body:JSON.stringify({package_id:selectedTier.id,client_price_quote:selectedTier.price,intake_mode:'tenant_link',tenant_name:name,tenant_phone:phone,property_title:String(form.get('property_title')||'Rental application').trim()||'Rental application',monthly_rent:form.get('rent_amount')?Number(form.get('rent_amount')):null})});
      const checkout=await screeningApi<{authorization_url:string}>(`/api/screenings/${encodeURIComponent(created.screening_id)}/checkout`,{method:'POST'});
      redirectToPaymentCheckout(checkout.authorization_url);
    }catch(e){setError(formatScreeningError(e));setBusy(false);}
  };

  const openReport=async(row:RequestRow)=>{
    if(row.status!=='complete'){setReport(row);return;}
    setBusy(true);setError('');
    try{const data=await screeningApi<ReportRow>(`/api/screenings/${encodeURIComponent(row.id)}`);setReport(data);}
    catch(e){setError(formatScreeningError(e));}
    finally{setBusy(false);}
  };
  const copyLink=async()=>{try{await navigator.clipboard.writeText(tenantLink);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError('Copy failed. Select and copy the link instead.');}};
  const decline=async()=>{if(!report)return;setBusy(true);try{await screeningApi(`/api/screenings/${encodeURIComponent(report.id)}/decline`,{method:'POST'});setReport(null);await refresh();}catch(e){setError(formatScreeningError(e));}finally{setBusy(false);}};
  const shareLink=async()=>{if(!report)return;setBusy(true);try{const data=await screeningApi<{tenant_url:string}>(`/api/screenings/${encodeURIComponent(report.id)}/tenant-link`,{method:'POST'});setReport(null);setTenantLink(data.tenant_url);}catch(e){setError(formatScreeningError(e));}finally{setBusy(false);}};
  const initials=`${user?.firstName?.[0]||'T'}${user?.lastName?.[0]||''}`.toUpperCase();
  const whatsappNumber=siteConfig.whatsapp.replace(/\D/g,'');
  const requestButton=(tierId='basic')=>{setError('');setFieldError('');setSelectedTierId(tierId);setTierStep(true);setCreateOpen(true);};
  const tierLabel=(id?:string)=>tiers.find(tier=>tier.id===id)?.name||'Identity';
  const selectedTier=tiers.find(tier=>tier.id===selectedTierId)||tiers[0];
  const selectedPackage=packageCatalog.find(item=>item.id===selectedTier.id);
  const statusClass=(status:string)=>status==='complete'?'tt-status-success':['failed','incomplete','declined','expired'].includes(status)?'tt-status-failed':'tt-status-pending';

  if(authLoading)return <main className="min-h-screen bg-slate-50 px-4 py-8" role="status" aria-label="Loading dashboard"><div className="mx-auto max-w-5xl"><Skeleton rows={4}/></div></main>;
  return <div className="tt-app tt-dashboard"><header className="dashboard-header"><Container className="dashboard-nav"><Link to="/" aria-label="TenTrust home" className="dashboard-brand"><Logo/></Link>
      <nav className={`dashboard-links${menuOpen?' is-open':''}`} aria-label="Dashboard navigation"><Link to="/dashboard" aria-current="page"><LayoutDashboard size={17}/>Dashboard</Link><a href="#verifications" onClick={()=>setMenuOpen(false)}>Verifications</a><Link to="/pricing">Pricing</Link>{whatsappNumber&&<a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">Help</a>}</nav>
      <div className="dashboard-account"><Button aria-label="New verification" className="dashboard-header-cta" onClick={()=>requestButton()}><Plus size={18} aria-hidden="true"/><span>New verification</span></Button><div className="dashboard-avatar-wrap"><button type="button" className="dashboard-avatar" aria-label="Open account menu" aria-expanded={avatarOpen} onClick={()=>setAvatarOpen(v=>!v)}>{initials}</button>{avatarOpen&&<div className="dashboard-dropdown"><Link to="/auth">Profile</Link><Link to="/pricing">Billing</Link><button type="button" onClick={async()=>{await logout();navigate('/');}}>Log out</button></div>}</div><button className="dashboard-menu-toggle" type="button" aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}><span/><span/><span/></button></div>
    </Container></header>
    <Container as="main" className="dashboard-main"><div className="dashboard-heading"><div><h1>Hello, {toTitleCase(user?.firstName||'there')}</h1><p>Here's where your tenant checks live.</p></div></div>
      {error&&<div className="dashboard-error" role="alert"><AlertCircle size={20}/><p>{error}</p><button type="button" onClick={()=>void refresh()}>Retry</button><button className="dashboard-error-dismiss" type="button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={18}/></button></div>}
      <div className="dashboard-stats"><StatCard label="Total requests" value={rows.length} icon={<FileText size={21}/>}/><StatCard label="Pending" value={pending} icon={<Clock size={21}/>}/><StatCard label="Completed" value={completed} icon={<CheckCircle2 size={21}/>}/></div>
      <section className="dashboard-verifications" id="verifications" aria-labelledby="requests-title"><div className="dashboard-list-heading"><div><h2 id="requests-title">Verifications</h2></div><label className={`dashboard-search${rows.length===0?' is-disabled':''}`}><Search size={18}/><span className="sr-only">Search verifications</span><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search tenants or properties" disabled={rows.length===0} aria-disabled={rows.length===0}/></label></div>
        <div className="dashboard-controls"><div className="dashboard-tabs" role="tablist" aria-label="Filter requests">{(['All','Pending','Completed'] as Filter[]).map(tab=>{const count=tab==='All'?rows.length:tab==='Completed'?completed:pending;return <button key={tab} role="tab" aria-selected={filter===tab} aria-disabled={rows.length===0} disabled={rows.length===0} className={`dashboard-tab ${filter===tab?'is-active':''}`} onClick={()=>setFilter(tab)}>{tab}<span>{count}</span></button>;})}</div></div>
        {loading?<div className="dashboard-skeletons" aria-label="Loading verifications" role="status">{Array.from({length:3},(_,i)=><div key={i} className="dashboard-skeleton"/>)}</div>:rows.length===0?<Card className="dashboard-empty-card"><div className="dashboard-empty"><span className="dashboard-empty-icon"><CheckCircle2 size={26}/></span><h3>No verifications yet</h3><p>Start your first one in under a minute.</p><ol className="dashboard-empty-steps"><li><b>1</b>Enter details</li><li><b>2</b>Tenant consents</li><li><b>3</b>Get result</li></ol><Button onClick={()=>requestButton()}><Plus size={18}/> New verification</Button><button ref={sampleTriggerRef} className="dashboard-sample-trigger" type="button" onClick={()=>setSampleOpen(true)}>See a sample report</button></div><div className="dashboard-empty-pricing"><div className="dashboard-tier-chips">{tiers.map(tier=><a key={tier.id} href="#new-verification" className="dashboard-tier-chip-link" onClick={event=>{event.preventDefault();requestButton(tier.id);}}><span className="dashboard-tier-chip-title"><strong>{tier.name}</strong>{tier.recommended&&<small>Recommended</small>}</span><span className="dashboard-tier-chip-description">{tier.description}</span><b>{formatNaira(tier.price)}</b></a>)}</div><Link to="/pricing">View pricing <ArrowRight size={15}/></Link></div></Card>:filtered.length===0?<Card><div className="dashboard-no-results"><Search size={22}/><p>No verifications match that search.</p><button type="button" onClick={()=>{setSearchQuery('');setFilter('All');}}>Clear filters</button></div></Card>:<>
          <div className="dashboard-table"><table><thead><tr><th>Tenant</th><th>Tier</th><th>Status</th><th>Date created</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong>{row.tenant_name}</strong><small>{row.property_title||'Rental application'}</small></td><td><span className="dashboard-tier-badge">{tierLabel(row.package_id)}</span></td><td><span className={`dashboard-status ${statusClass(row.status)}`}>{row.status==='complete'?'Completed':['failed','incomplete','declined','expired'].includes(row.status)?'Failed':'Pending'}</span></td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><button className="dashboard-report-link" type="button" onClick={()=>void openReport(row)}>View report <ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>
          <div className="dashboard-mobile-list">{filtered.map(row=><article className="dashboard-mobile-row" key={row.id}><div className="dashboard-mobile-row-top"><strong>{row.tenant_name}</strong><span className={`dashboard-status ${statusClass(row.status)}`}>{row.status==='complete'?'Completed':['failed','incomplete','declined','expired'].includes(row.status)?'Failed':'Pending'}</span></div><p>{row.property_title||'Rental application'}</p><div className="dashboard-mobile-meta"><span className="dashboard-tier-badge">{tierLabel(row.package_id)}</span><time>{new Date(row.created_at).toLocaleDateString()}</time><button className="dashboard-report-link" type="button" onClick={()=>void openReport(row)}>View report <ArrowRight size={15}/></button></div></article>)}</div>
        </>}
      </section>
    </Container>

    {createOpen&&<div className="tt-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setCreateOpen(false);}}><Card className="tt-modal dashboard-flow-modal" role="dialog" aria-modal="true" aria-labelledby="new-verification-title"><div className="tt-modal-head"><div><p className="dashboard-eyebrow">STEP {tierStep?'1':'2'} OF 2</p><h2 id="new-verification-title">{tierStep?'Choose a verification tier':'Tenant details'}</h2><p className="tt-muted" style={{margin:0}}>{tierStep?'Select the level of detail you need.':'The tenant completes the check on their phone.'}</p></div><button className="tt-close" onClick={()=>setCreateOpen(false)} aria-label="Close"><X size={21}/></button></div>
      {fieldError&&<Toast>{fieldError}</Toast>}{error&&<Toast>{error}</Toast>}
      {tierStep?<><fieldset className="dashboard-tier-options"><legend className="sr-only">Choose a verification tier</legend>{tiers.map(tier=><label key={tier.id} className={`dashboard-tier-option${selectedTier.id===tier.id?' is-selected':''}`}><input type="radio" name="verification-tier" value={tier.id} checked={selectedTier.id===tier.id} onChange={()=>setSelectedTierId(tier.id)}/><span className="dashboard-tier-option-content"><span className="dashboard-tier-option-head"><strong>{tier.name}</strong>{tier.recommended&&<span>Recommended</span>}</span><b>{formatNaira(tier.price)} <small>/ check</small></b><span className="dashboard-tier-desc">{tier.description}</span><ul>{tier.includes.map(item=><li key={item}><Check size={15}/>{item}</li>)}</ul><small className="dashboard-turnaround"><Clock size={14}/> Turnaround: {tier.turnaround}</small></span></label>)}</fieldset><div className="dashboard-flow-summary"><span><strong>{selectedTier.name}</strong><small>Total (estimate)</small></span><b>{formatNaira(selectedTier.price)}</b><Button onClick={()=>setTierStep(false)}>Continue <ArrowRight size={17}/></Button></div></>:<><form id="verification-details-form" className="tt-form" onSubmit={createRequest} noValidate>
        <Input id="tenant_name" name="tenant_name" label="Tenant full name" autoComplete="name" required maxLength={160} placeholder="As shown on their ID" helper="Use the name the tenant uses on their ID."/>
        <Input id="tenant_phone" name="tenant_phone" label="Tenant phone number" type="tel" inputMode="tel" autoComplete="tel" required placeholder="08012345678" helper="We’ll show you a link to share after payment."/>
        <div className="tt-field"><label htmlFor="property_title">Property label <span className="tt-muted">(optional)</span></label><input id="property_title" name="property_title" maxLength={200} placeholder="e.g. Flat 4, Ikeja"/></div>
        <div className="tt-field"><label htmlFor="rent_amount">Rent amount <span className="tt-muted">(optional)</span></label><input id="rent_amount" name="rent_amount" type="number" min="1" step="1" inputMode="numeric" placeholder="₦"/><p className="tt-help">For your notes only. We do not check income or credit.</p></div>
        {!selectedPackage&&<p className="dashboard-package-note" role="status">This tier is not configured in the current checkout yet. The server package catalog needs to be updated before it can be purchased.</p>}
        {selectedPackage&&!selectedPackage.enabled&&<p className="dashboard-package-note" role="status">{selectedPackage.unavailable_reason||'This check is not available right now.'}</p>}
        <div className="dashboard-form-actions"><button type="button" className="dashboard-back-button" onClick={()=>setTierStep(true)}><ArrowRight size={16}/> Change tier</button><Button type="submit" loading={busy} disabled={!selectedPackage?.enabled}>Pay and send request</Button></div>
      </form><div className="dashboard-flow-summary is-form-summary"><span><strong>{selectedTier.name}</strong><small>Estimated total</small></span><b>{formatNaira(selectedTier.price)}</b></div></>}
    </Card></div>}

    {sampleOpen&&<div className="tt-modal-backdrop dashboard-sample-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSampleOpen(false);}}><Card className="tt-modal dashboard-sample-dialog" role="dialog" aria-modal="true" aria-labelledby="sample-report-title"><div className="tt-modal-head"><div><p className="dashboard-eyebrow">SAMPLE PREVIEW</p><h2 id="sample-report-title">A clearer view of a tenant check</h2><p className="tt-muted" style={{margin:0}}>This sample uses fictional information.</p></div><button ref={sampleCloseRef} type="button" className="tt-close" onClick={()=>setSampleOpen(false)} aria-label="Close sample report"><X size={21}/></button></div><SampleReportCard large/></Card></div>}

    {(tenantLink||paymentConfirming)&&<div className="tt-modal-backdrop"><Card className="tt-modal" role="dialog" aria-modal="true" aria-labelledby="link-title"><div className="tt-modal-head"><div><p className="tt-eyebrow">{paymentConfirming?'Payment received':'Payment confirmed'}</p><h2 id="link-title">{paymentConfirming?'Preparing the tenant link…':'Now send the tenant their secure link'}</h2></div>{!paymentConfirming&&<button className="tt-close" onClick={()=>setTenantLink('')} aria-label="Close"><X size={21}/></button>}</div>{paymentConfirming?<p className="tt-muted" role="status">We’re confirming the payment and creating a private link. This usually takes a few seconds.</p>:<><p className="tt-muted">The tenant needs to complete this step themselves so they can give consent and enter their ID details privately. You won’t see or need to collect their BVN, NIN, or date of birth.</p><ol style={{margin:'14px 0 18px',paddingLeft:22,lineHeight:1.65}}><li>Send the link below to the tenant.</li><li>Ask them to open it on their phone, review the notice, and give consent.</li><li>They enter their ID details privately; their verification result will appear in your dashboard.</li></ol><p className="tt-help" style={{marginBottom:8}}>This private link expires in 48 hours. Copy it and send it directly to your tenant.</p><div className="tt-link-box"><input readOnly value={tenantLink} aria-label="Tenant verification link"/><Button kind="secondary" onClick={()=>void copyLink()}>{copied?'Copied':'Copy link'}</Button></div><a className="tt-button tt-button-primary" style={{marginTop:12,width:'100%'}} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Please complete your TenTrust identity verification. Open this secure link on your phone, review the consent notice, and enter your ID details privately: ${tenantLink}`)}`}>Share on WhatsApp <ArrowRight size={18}/></a></>}</Card></div>}

    {report&&<div className="tt-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setReport(null);}}><Card className="tt-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="tt-modal-head"><div><h2 id="report-title">Verification details</h2><p className="tt-muted" style={{margin:0}}>{report.property_title}</p></div><button className="tt-close" onClick={()=>setReport(null)} aria-label="Close"><X size={21}/></button></div>
      {report.status==='complete'?<><div className="tt-result"><VerifiedBadge verified/><h2>Identity verified</h2><p>The identity details were checked. Review the name match below.</p></div><div className="tt-detail-grid"><div className="tt-detail"><span>Tenant</span><strong>{report.tenant_name}</strong></div><div className="tt-detail"><span>Name match</span><strong>{(report.name_match||'not available').replaceAll('_',' ')}</strong></div><div className="tt-detail"><span>Checked</span><strong>{report.identity_verified_at?new Date(report.identity_verified_at).toLocaleString():'—'}</strong></div><div className="tt-detail"><span>Report ID</span><strong>{report.report_id||'—'}</strong></div><div className="tt-detail"><span>Document</span><strong>{report.masked_document||'Hidden'}</strong></div></div>{report.name_match&&report.name_match!=='match'&&<p className="tt-name-flag" style={{marginTop:12}}>The name did not match exactly. Review this result with the tenant before making a decision.</p>}<div className="tt-action-row"><Button onClick={()=>void downloadReport(report)}><FileText size={19}/> Download PDF report</Button></div></>:<>{report.status==='incomplete'&&<div className="tt-result"><VerifiedBadge verified={false}/><h2>Could not verify</h2><p>Ask the tenant to check their details, then share a new link if needed.</p></div>}<div className="tt-detail-grid"><div className="tt-detail"><span>Tenant</span><strong>{report.tenant_name}</strong></div><div className="tt-detail"><span>Status</span><strong><StatusChip status={report.status}/></strong></div><div className="tt-detail"><span>Date</span><strong>{new Date(report.created_at).toLocaleString()}</strong></div></div>{report.status==='incomplete'&&<div className="tt-action-row"><Button onClick={()=>void downloadReport(report)}><FileText size={19}/> Download PDF report</Button></div>}{report.payment_status==='paid'&&['awaiting_tenant','paid_ready','expired','incomplete'].includes(report.status)&&<div className="tt-action-row"><Button onClick={()=>void shareLink()} loading={busy}><UserRoundPlus size={18}/> Get tenant link</Button></div>}{report.status!=='declined'&&report.status!=='expired'&&<div className="tt-action-row"><Button kind="secondary" onClick={()=>void decline()} loading={busy}>Mark as declined</Button></div>}</>}
    </Card></div>}
  </div>;
}

