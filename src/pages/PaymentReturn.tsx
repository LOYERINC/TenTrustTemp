import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, Container, Logo } from '../components/mvp-ui';
import { screeningApi, ScreeningApiError } from '../lib/screeningApi';
import { redirectToPaymentCheckout } from '../lib/paymentCheckout';
import { OrderStatus, paymentReturnPath, pollOrderStatus, readPaymentReference } from '../lib/paymentReturn';

const button = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-50';
function Shell({ children }: {children: React.ReactNode}) {
  return <main className="tt-app min-h-screen bg-slate-50 py-10"><Container><Link to="/" aria-label="TenTrust home"><Logo/></Link><Card className="mx-auto mt-8 max-w-xl p-6 sm:p-8">{children}</Card></Container></main>;
}

export default function PaymentReturn() {
  const { search } = useLocation(); const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const reference = readPaymentReference(search);
  const [state, setState] = useState<'checking'|'pending'|'failed'|'abandoned'|'login'|'missing'>('checking');
  const [message, setMessage] = useState(''); const [cycle, setCycle] = useState(0); const [busy, setBusy] = useState(false);
  const returnPath = reference ? paymentReturnPath(reference) : '/payments/recover';
  const login = '/auth?' + new URLSearchParams({ returnTo:returnPath });
  useEffect(() => {
    if (isLoading || !reference || !user) return;
    setState('checking'); setMessage('');
    return pollOrderStatus(
      signal=>screeningApi<OrderStatus>(`/api/orders/${encodeURIComponent(reference)}/status`,{signal}),
      result=>{
        if(result.status==='paid'){navigate(result.success_url,{replace:true});return false;}
        if(result.status==='failed'||result.status==='abandoned'){setState(result.status);return false;}
        return true;
      },
      error=>{
        if(error instanceof ScreeningApiError&&error.status===401){setState('login');return false;}
        if(error instanceof ScreeningApiError&&error.status===404){setState('missing');return false;}
        setMessage('Confirmation is taking a little longer. We will keep checking this payment.');return true;
      },
      ()=>{setState('pending');setMessage('');},
    );
  },[reference,user?.id,isLoading,cycle,navigate]);

  async function retry() {
    if (!reference) return;
    if (state!=='failed' && state!=='abandoned') {setCycle(v=>v+1);return;}
    setBusy(true);setMessage('');
    try {
      const result=await screeningApi<OrderStatus>(`/api/orders/${encodeURIComponent(reference)}/retry`,{method:'POST'});
      if(result.status==='paid'){navigate(result.success_url||'/dashboard',{replace:true});}
      else if(result.authorization_url) redirectToPaymentCheckout(result.authorization_url);
      else {navigate(paymentReturnPath(result.reference),{replace:true});setCycle(v=>v+1);}
    } catch(error) {
      if(error instanceof ScreeningApiError && error.status===401)setState('login');
      else setMessage('We could not safely start another attempt. Recheck this payment or contact support; do not pay again yet.');
    } finally {setBusy(false);}
  }

  const needsLogin=!isLoading && (!user || state==='login');
  return <Shell>
    <h1 className="mb-4 text-2xl font-bold">{needsLogin?'Log in to view your result':'Confirming your payment'}</h1>
    {!reference?<><p>The payment reference is missing or invalid.</p><a className={button+' mt-5'} href="mailto:contact@tentrust.com.ng?subject=Payment%20support">Contact support</a></>
      :isLoading?<p role="status">Loading your account…</p>
      :needsLogin?<><p>Your payment can still be confirmed while you are signed out. Log in to view your result.</p><Link className={button+' mt-5'} to={login}>Log in to view your result</Link></>
      :<>
        {state==='checking'&&<p role="status">Confirming your payment...</p>}
        {state==='pending'&&<p role="status">We're still confirming your payment. You won't be charged twice. Check back shortly.</p>}
        {(state==='failed'||state==='abandoned')&&<p role="status">{state==='failed'?'Paystack reports that this payment failed.':'Paystack reports that this payment was not completed.'} We will recheck it before allowing another payment attempt.</p>}
        {state==='missing'&&<p role="alert">This payment is not linked to your signed-in account. Use the account that started the payment or contact support.</p>}
        {message&&<p className="mt-4" role="status">{message}</p>}
        {['pending','failed','abandoned'].includes(state)&&<button type="button" className={button+' mt-5'} disabled={busy} onClick={()=>void retry()}>{busy?'Rechecking…':state==='pending'?'Check again':'Retry payment'}</button>}
      </>}
    {reference&&<p className="mt-5 break-all text-sm text-slate-600">Payment reference: <strong>{reference}</strong></p>}
    <div className="mt-6 flex flex-wrap gap-5 text-sm font-semibold text-blue-800"><a href={'mailto:contact@tentrust.com.ng?'+new URLSearchParams({subject:'Payment help: '+(reference||'missing reference'),body:'Please help confirm my payment. Reference: '+(reference||'unknown')})}>Contact support</a><a href={'https://wa.me/2349058283054?'+new URLSearchParams({text:'Hello TenTrust, I need help with my payment. Reference: '+(reference||'not available')})} target="_blank" rel="noopener noreferrer">Contact us on WhatsApp</a></div>
  </Shell>;
}

export function PaymentRecovery() {
  const { user,isLoading }=useAuth();const navigate=useNavigate();
  const [value,setValue]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [orders,setOrders]=useState<OrderStatus[]>([]);
  async function recover(event:FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');setOrders([]);
    try {
      const input=value.trim();const body=input.includes('@')?{email:input}:{reference:input};
      const result=await screeningApi<{orders:OrderStatus[]}>('/api/orders/recover',{method:'POST',body:JSON.stringify(body)});
      if(result.orders.length===1){navigate(paymentReturnPath(result.orders[0].reference));return;}
      setOrders(result.orders);if(!result.orders.length)setMessage('No unresolved payments were found for this account. You can also enter your exact reference.');
    }catch(error){setMessage(error instanceof ScreeningApiError&&error.status===401?'Please log in again, then return to this page.':error instanceof Error?error.message:'Unable to check right now. Do not pay again.');}
    finally{setBusy(false);}
  }
  return <Shell><h1 className="mb-4 text-2xl font-bold">I've paid but it didn't work</h1>
    <p>We will check the existing payment with Paystack. This will not charge you again.</p>
    {isLoading?<p role="status">Loading your account…</p>:!user?<Link className={button+' mt-5'} to={'/auth?'+new URLSearchParams({returnTo:'/payments/recover'})}>Log in to recover your payment</Link>:<form onSubmit={recover} className="mt-6 space-y-4"><label className="block font-semibold" htmlFor="payment-recovery">Payment reference or your account email</label><input id="payment-recovery" className="min-h-12 w-full rounded-lg border border-slate-400 p-3" required maxLength={254} value={value} onChange={e=>setValue(e.target.value)}/><button className={button} disabled={busy}>{busy?'Checking Paystack…':'Check my payment'}</button></form>}
    {message&&<p className="mt-4" role="status">{message}</p>}
    <ul className="mt-5 space-y-3">{orders.map(order=><li key={order.reference}><Link className="break-all font-semibold text-blue-800 underline" to={paymentReturnPath(order.reference)}>{order.reference}: {order.status}</Link></li>)}</ul>
    <p className="mt-5 text-sm text-slate-600">For email recovery, use the email of your signed-in account. For older or different email addresses, use the exact reference or contact support.</p><a className="mt-4 inline-block font-semibold text-blue-800 underline" href="mailto:contact@tentrust.com.ng">Contact support</a>
  </Shell>;
}
