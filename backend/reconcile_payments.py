"""One-time recovery: python reconcile_payments.py [--apply] [--limit 100].

Run from backend with its server-only environment. Dry-run is the default.
Only existing Paystack orders older than ten minutes are inspected.
"""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import logging
from services.screening_store import SupabaseStore, close_http_clients
from services.payment_orders import apply_transaction, verify_transaction


async def reconcile(apply=False, limit=100):
    store=SupabaseStore()
    rows=await store.request('GET','screening_payments',params={
        'provider':'eq.paystack','status':'eq.pending',
        'created_at':'lt.'+(datetime.now(timezone.utc)-timedelta(minutes=10)).isoformat(),
        'order':'created_at.asc','limit':str(limit),'select':'*',
    })
    results=[]
    for row in rows:
        ref=row['reference']
        try:
            transaction=await verify_transaction(ref)
            if apply:
                result=await apply_transaction(store,row,transaction)
                state=result['status']
            else: state=transaction.get('status','unknown')
            results.append({'reference':ref,'status':state,'applied':apply})
        except Exception:
            # Never mark an unavailable/unknown transaction failed or create a new charge.
            logging.warning('payment.reconcile reference=%s outcome=unconfirmed',ref)
            results.append({'reference':ref,'status':'unconfirmed','applied':False})
    return results


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--limit',type=int,default=100)
    args=parser.parse_args()
    if not 1<=args.limit<=500: parser.error('--limit must be between 1 and 500')
    logging.basicConfig(level=logging.INFO)
    try:
        for result in await reconcile(args.apply,args.limit): print(result)
    finally: await close_http_clients()


if __name__=='__main__': asyncio.run(main())
