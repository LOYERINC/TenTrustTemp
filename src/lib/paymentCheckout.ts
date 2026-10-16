/** Only follows a server-issued checkout URL; the backend remains the payment authority. */
export function redirectToPaymentCheckout(authorizationUrl: string) {
  const checkout = new URL(authorizationUrl);
  if (checkout.protocol !== 'https:' || !['checkout.paystack.com', 'checkout.flutterwave.com'].includes(checkout.hostname)) {
    throw new Error('The payment service returned an invalid checkout URL.');
  }
  window.location.assign(checkout.toString());
}
