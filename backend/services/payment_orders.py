"""Session-independent Paystack settlement. No client amount/user/status is accepted."""
import json
import logging
import re
from datetime import datetime
from urllib.parse import urlencode, urlsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException
from config import settings
from services.screening_store import get_http_client

log = logging.getLogger(__name__)
REFERENCE = re.compile(r'^[A-Za-z0-9_.=-]{1,120}$')


def reference(value):
    if not isinstance(value, str) or not REFERENCE.fullmatch(value):
        raise HTTPException(422, 'Enter a valid payment reference.')
    return value


def return_url(ref, origin=None):
    canonical = settings.PUBLIC_APP_URL.rstrip('/')
    base = urlsplit(canonical)
    if base.scheme not in ('https', 'http') or not base.netloc or base.username or base.password:
        raise HTTPException(503, 'The app return URL is not configured.')
    allowed = {canonical, *settings.cors_origins}
    chosen = origin or canonical
    if chosen not in allowed or '*' in chosen:
        raise HTTPException(400, 'Start payment from an allowed app address.')
    parsed = urlsplit(chosen)
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise HTTPException(400, 'Invalid app address.')
    if settings.ENVIRONMENT == 'production' and parsed.scheme != 'https':
        raise HTTPException(503, 'Production payment returns require HTTPS.')
    return f'{chosen.rstrip("/")}/payments/return?{urlencode({"reference": reference(ref)})}'


async def verify_transaction(ref):
    reference(ref)
    if not settings.PAYSTACK_SECRET_KEY:
        raise HTTPException(503, 'Paystack is not configured.')
    try:
        response = await get_http_client('provider').get(
            f'https://api.paystack.co/transaction/verify/{ref}',
            headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'},
        )
        body = response.json()
    except (httpx.RequestError, ValueError) as exc:
        log.warning('payment.verify reference=%s outcome=unavailable', ref)
        raise HTTPException(503, 'Payment confirmation is temporarily unavailable. Do not pay again.') from exc
    if response.status_code != 200 or not body.get('status') or not isinstance(body.get('data'), dict):
        log.warning('payment.verify reference=%s http=%s outcome=unconfirmed', ref, response.status_code)
        raise HTTPException(503, 'Payment is not confirmed yet. Recheck this reference; do not pay again.')
    transaction = {**body['data'], 'provider': 'paystack'}
    state = transaction.get('status')
    log.info('payment.verify reference=%s outcome=%s', ref, state if state in ('success','failed','abandoned','pending','ongoing','processing','queued','reversed') else 'unknown')
    return transaction


def validate_transaction(order, transaction):
    amount = transaction.get('amount')
    if (transaction.get('reference') != order['reference'] or type(amount) is not int
        or amount != order['amount_kobo'] or transaction.get('currency') != order['currency']
        or order.get('provider', 'paystack') != 'paystack'
        or transaction.get('provider', 'paystack') != 'paystack'):
        log.warning('payment.mismatch reference=%s', order['reference'])
        raise HTTPException(400, 'Payment details do not match this order.')
    if order.get('mode') in ('test','live') and transaction.get('domain') != order['mode']:
        raise HTTPException(400, 'Payment mode does not match this order.')
    metadata = transaction.get('metadata') or {}
    if isinstance(metadata, str):
        try: metadata = json.loads(metadata)
        except ValueError: metadata = {}
    if isinstance(metadata, dict):
        for key, expected in [('order_id', order['id']), ('user_id', order['landlord_id']), ('screening_id', order['screening_id'])]:
            if metadata.get(key) is not None and str(metadata[key]) != str(expected):
                raise HTTPException(400, 'Payment metadata does not match this order.')


async def apply_transaction(store, order, transaction):
    validate_transaction(order, transaction)
    state = {'success':'paid','failed':'failed','abandoned':'abandoned'}.get(transaction.get('status'), 'pending')
    if order['status'] == 'paid':
        log.info('payment.fulfill reference=%s outcome=already_paid', order['reference'])
        return order
    transaction_id = str(transaction.get('id', '')) if state == 'paid' else None
    paid_at = transaction.get('paid_at') or transaction.get('paidAt')
    if state == 'paid':
        if not re.fullmatch(r'[0-9]{1,40}', transaction_id):
            raise HTTPException(400, 'Payment transaction ID is missing.')
        if paid_at:
            try: datetime.fromisoformat(paid_at.replace('Z', '+00:00'))
            except (ValueError, AttributeError): raise HTTPException(400, 'Payment timestamp is invalid.')
    result = await store.rpc('settle_paystack_order', {
        'p_reference': order['reference'], 'p_amount_kobo': order['amount_kobo'],
        'p_currency': order['currency'], 'p_status': state,
        'p_transaction_id': transaction_id, 'p_paid_at': paid_at if state == 'paid' else None,
    })
    log.info('payment.fulfill reference=%s outcome=%s', order['reference'], result['status'])
    return result


async def refresh_order(store, order, force=False):
    if order['status'] == 'paid' or (not force and order['status'] != 'pending'):
        return order
    if order.get('provider') != 'paystack':
        raise HTTPException(409, 'Use the original provider flow for this payment.')
    return await apply_transaction(store, order, await verify_transaction(order['reference']))


def public_status(order):
    ref = order['reference']
    return {'order_id':order['id'], 'reference':ref, 'screening_id':order['screening_id'],
            'status':order['status'], 'amount_kobo':order['amount_kobo'], 'currency':order['currency'],
            'success_url':'/dashboard?'+urlencode({'screening':order['screening_id'], 'paid_reference':ref})}


async def initialize(store, screening, user, package, origin=None):
    from services.manual_identity import manual_case, encryption_key
    if manual_case(screening) and screening.get('payment_status') != 'paid':
        encryption_key()
        try:
            await store.request('GET', 'screening_private_evidence', params={
                'select':'identity_intake_encrypted,identity_intake_at,identity_review_encrypted', 'limit':'0'})
        except Exception:
            raise HTTPException(503, 'Manual review storage setup is incomplete. No charge was created.') from None
    ref = f'tt_{uuid4().hex}'
    callback = return_url(ref, origin)  # Validate before creating an order.
    result = await store.rpc('reserve_paystack_order', {
        'p_screening_id':screening['id'], 'p_user_id':user['id'], 'p_reference':ref,
        'p_amount_kobo':int(package['price'] * 100), 'p_currency':'NGN',
        'p_mode':'test' if settings.PAYSTACK_SECRET_KEY.startswith('sk_test_') else 'live',
        'p_email':user.get('email') or screening.get('landlord_email'),
    })
    if result.get('already_paid'):
        return {'status':'paid','screening_id':screening['id'],'success_url':'/dashboard'}
    order = result['order']
    if not result['created']:
        if order.get('provider') != 'paystack':
            raise HTTPException(409, 'An existing payment uses a different provider. Recover that payment first.')
        try: order = await refresh_order(store, order)
        except HTTPException as exc:
            if exc.status_code != 503: raise
        return {**public_status(order), 'return_url':return_url(order['reference'], origin)}
    log.info('payment.initialize reference=%s order=%s outcome=pending', ref, order['id'])
    body = {'email':user.get('email') or screening['landlord_email'], 'amount':order['amount_kobo'],
            'currency':order['currency'], 'reference':ref, 'callback_url':callback,
            'metadata':{'order_id':order['id'],'user_id':user['id'],'screening_id':screening['id'],'package_id':screening['package_id']}}
    try:
        response = await get_http_client('provider').post('https://api.paystack.co/transaction/initialize',
            json=body, headers={'Authorization':f'Bearer {settings.PAYSTACK_SECRET_KEY}'})
        data = response.json()
    except (httpx.RequestError, ValueError):
        # An acknowledgement can be lost after initialization. Preserve the same reference.
        return {**public_status(order), 'return_url':callback}
    if response.status_code >= 400 or not data.get('status'):
        if response.status_code in (400,401,403,422) and 'exist' not in str(data.get('message','')).lower():
            order = await store.rpc('settle_paystack_order', {'p_reference':ref,'p_amount_kobo':order['amount_kobo'],
                'p_currency':order['currency'],'p_status':'failed','p_transaction_id':None,'p_paid_at':None})
        return {**public_status(order), 'return_url':callback}
    authorization_url = (data.get('data') or {}).get('authorization_url')
    parsed = urlsplit(authorization_url) if isinstance(authorization_url, str) else None
    if not parsed or parsed.scheme != 'https' or parsed.hostname != 'checkout.paystack.com' or parsed.username or parsed.password:
        return {**public_status(order), 'return_url':callback}
    await store.patch('screening_payments', {'id':f'eq.{order["id"]}'}, {'authorization_url':authorization_url})
    return {**public_status(order), 'authorization_url':authorization_url, 'return_url':callback}
