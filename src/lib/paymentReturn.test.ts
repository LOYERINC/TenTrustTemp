import test from 'node:test';
import assert from 'node:assert/strict';
import { readPaymentReference,paymentReturnPath,pollOrderStatus,type PaymentPollClock,type OrderStatus } from './paymentReturn';
import { authLinkReturnTo,safeDashboardReturnTo } from './authLinks';
import { verifyAuthLink } from './verifyAuthLink';

test('reference survives duplicate Paystack query parameters without browser storage',()=>{
  assert.equal(readPaymentReference('?reference=tt_ok&trxref=tt_ok&reference=tt_ok'),'tt_ok');
  assert.equal(readPaymentReference('?reference=tt_a&reference=tt_b'),null);
  assert.equal(readPaymentReference('?reference=%0Aforged'),null);
  assert.equal(readPaymentReference('?reference=../admin'),null);
});
test('expired-session login preserves the payment return; external redirects are rejected',()=>{
  const target=paymentReturnPath('tt_paid');
  const login='/auth?'+new URLSearchParams({returnTo:target});
  assert.equal(safeDashboardReturnTo(new URL(login,'https://www.tentrust.com.ng').searchParams.get('returnTo'),'https://www.tentrust.com.ng'),target);
  for(const bad of ['//evil.test','https://evil.test/payments/return','/\\evil.test','/admin','/payments/return/../../admin'])assert.equal(safeDashboardReturnTo(bad,'https://www.tentrust.com.ng'),null);
});
test('OAuth and email callbacks carry the reference in the URL, with no sessionStorage',()=>{
  const origin='https://www.tentrust.com.ng';const target=paymentReturnPath('tt_paid');
  const next=origin+'/auth/callback?'+new URLSearchParams({returnTo:target});
  assert.equal(authLinkReturnTo(origin+'/auth/callback?'+new URLSearchParams({next}),origin),target);
  assert.equal(authLinkReturnTo(origin+'/auth/callback?'+new URLSearchParams({next:'https://evil.test/auth/callback?returnTo=/payments/return'}),origin),null);
});

test('Supabase confirmation URLs preserve the query before implicit session renewal',async()=>{
  const origin='http://127.0.0.1:3000';const target=paymentReturnPath('tt_paid');
  const href=origin+'/auth/callback?'+new URLSearchParams({returnTo:target})+'#access_token=test-only&type=magiclink';
  const client={auth:{verifyOtp:async()=>({error:null}),getSession:async()=>({data:{session:{access_token:'test-only'}},error:null}),getUser:async()=>({data:{user:{id:'owner'}},error:null})}};
  await verifyAuthLink(client,href,false,{hasToken:true,type:'magiclink'});
  assert.equal(authLinkReturnTo(href,origin),target);
});

class Clock implements PaymentPollClock {
  now=0;id=0;tasks=new Map<number,{fn:()=>void,at:number,period:number}>();
  every=(fn:()=>void,ms:number)=>{const id=++this.id;this.tasks.set(id,{fn,at:this.now+ms,period:ms});return id;};
  after=(fn:()=>void,ms:number)=>{const id=++this.id;this.tasks.set(id,{fn,at:this.now+ms,period:0});return id;};
  cancelEvery=(id:number)=>{this.tasks.delete(id);};cancelAfter=this.cancelEvery;
  async advance(ms:number){const end=this.now+ms;while(true){const next=[...this.tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const[id,task]=next;this.now=task.at;if(task.period)task.at+=task.period;else this.tasks.delete(id);task.fn();await Promise.resolve();await Promise.resolve();}this.now=end;}
}
const pending={reference:'tt_paid',status:'pending'} as OrderStatus;
test('polls immediately then every three seconds and stops after sixty seconds',async()=>{
  const clock=new Clock();let requests=0,timeouts=0;
  pollOrderStatus(async()=>{requests++;return pending;},()=>true,()=>true,()=>timeouts++,clock);
  await Promise.resolve();await clock.advance(60000);assert.equal(timeouts,1);assert.equal(clock.tasks.size,0);
  assert.ok(requests>=20&&requests<=21);const count=requests;await clock.advance(30000);assert.equal(requests,count);
});
test('late responses after logout/unmount cannot navigate or fulfill; requests never overlap',async()=>{
  const clock=new Clock();let requests=0,results=0;let resolve!:(order:OrderStatus)=>void;
  const stop=pollOrderStatus(async()=>{requests++;return new Promise<OrderStatus>(done=>{resolve=done;});},()=>{results++;return false;},()=>true,()=>{},clock);
  await clock.advance(9000);assert.equal(requests,1);stop();resolve({...pending,status:'paid'});await Promise.resolve();await Promise.resolve();assert.equal(results,0);
});
test('a paid result or auth failure stops polling instead of charging again',async()=>{
  for(const fails of [false,true]){
    const clock=new Clock();let results=0,errors=0;
    pollOrderStatus(async()=>{if(fails)throw new Error('auth');return {...pending,status:'paid'};},()=>{results++;return false;},()=>{errors++;return false;},()=>{},clock);
    await Promise.resolve();await Promise.resolve();assert.equal(clock.tasks.size,0);assert.equal(results+errors,1);
  }
});
