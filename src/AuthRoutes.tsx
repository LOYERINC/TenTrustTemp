import { lazy, Suspense } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

const Auth = lazy(() => import('./pages/Auth'));
const AuthLink = lazy(() => import('./pages/AuthLink'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDemoOperations'));
const Listings = lazy(() => import('./pages/Listings'));
const KYCForm = lazy(() => import('./pages/KYCForm'));

export default function AuthRoutes() {
  const { pathname } = useLocation();
  const Page = ['/auth/reset-password', '/auth/callback'].includes(pathname) ? AuthLink : pathname === '/auth' ? Auth
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
