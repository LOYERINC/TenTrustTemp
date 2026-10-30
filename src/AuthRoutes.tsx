import { lazy, Suspense } from 'react';
import { matchPath, Navigate, useLocation } from 'react-router-dom';
import { readPaymentReference, paymentReturnPath } from './lib/paymentReturn';
import { AuthProvider } from './context/AuthContext';

const Auth = lazy(() => import('./pages/Auth'));
const AuthLink = lazy(() => import('./pages/AuthLink'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDemoOperations'));
const Listings = lazy(() => import('./pages/Listings'));
const KYCForm = lazy(() => import('./pages/KYCForm'));
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'));
const PaymentRecovery = lazy(() => import('./pages/PaymentReturn').then(module => ({ default: module.PaymentRecovery })));

export default function AuthRoutes() {
  const { pathname, search } = useLocation();
  const legacyReference = pathname === '/dashboard' ? readPaymentReference(search) : null;
  const legacyQuery = new URLSearchParams(search);
  if (pathname === '/dashboard' && (legacyQuery.has('reference') || legacyQuery.has('trxref'))) {
    return <Navigate to={legacyReference ? paymentReturnPath(legacyReference) : '/payments/return'} replace/>;
  }
  const Page = ['/auth/reset-password', '/auth/callback'].includes(pathname) ? AuthLink : pathname === '/auth' ? Auth
    : pathname === '/payments/return' ? PaymentReturn
    : pathname === '/payments/recover' ? PaymentRecovery
    : pathname === '/dashboard' ? Dashboard
    : pathname === '/admin' ? AdminDashboard
    : pathname === '/listings' ? Listings
    : matchPath('/apply/:propertyId', pathname) ? KYCForm
    : Auth;
  return <AuthProvider>
    <Suspense fallback={<main className="min-h-screen p-6" role="status" aria-label="Loading account page"><div className="mx-auto h-24 max-w-5xl animate-pulse rounded-2xl bg-slate-200" /></main>}>
      <Page />
    </Suspense>
  </AuthProvider>;
}
