export const validPaymentReference = (value: string | null): value is string => Boolean(value && /^[A-Za-z0-9_.=-]{1,120}$/.test(value));
export function readPaymentReference(search: string): string | null {
  const query = new URLSearchParams(search);
  const refs = [...query.getAll('reference'), ...query.getAll('trxref')];
  return refs.length && refs.every(ref => ref === refs[0]) && validPaymentReference(refs[0]) ? refs[0] : null;
}
export const paymentReturnPath = (reference: string) => '/payments/return?' + new URLSearchParams({ reference });
export interface OrderStatus {
  order_id: string; reference: string; screening_id: string;
  status: 'pending' | 'paid' | 'failed' | 'abandoned';
  success_url: string; authorization_url?: string; return_url?: string;
}

export interface PaymentPollClock {
  every: (fn:()=>void,ms:number)=>number; after:(fn:()=>void,ms:number)=>number;
  cancelEvery:(id:number)=>void; cancelAfter:(id:number)=>void;
}
export function pollOrderStatus(
  load:(signal:AbortSignal)=>Promise<OrderStatus>,
  onResult:(order:OrderStatus)=>boolean, onError:(error:unknown)=>boolean, onTimeout:()=>void,
  clock:PaymentPollClock={every:(fn,ms)=>window.setInterval(fn,ms),after:(fn,ms)=>window.setTimeout(fn,ms),cancelEvery:id=>window.clearInterval(id),cancelAfter:id=>window.clearTimeout(id)},
) {
  let stopped=false;let inFlight=false;const abort=new AbortController();
  const stop=()=>{stopped=true;clock.cancelEvery(interval);clock.cancelAfter(timeout);abort.abort();};
  const check=async()=>{
    if(stopped||inFlight)return;inFlight=true;
    try{const result=await load(abort.signal);if(!stopped&&!onResult(result))stop();}
    catch(error){if(!stopped&&!onError(error))stop();}
    finally{inFlight=false;}
  };
  const interval=clock.every(()=>void check(),3000);
  const timeout=clock.after(()=>{stop();onTimeout();},60000);
  void check();return stop;
}
