/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AIChatbot from './components/AIChatbot';
import TermsAcceptanceModal from './components/TermsAcceptanceModal';

const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard'));
const Listings = lazy(() => import('./pages/Listings'));
const Auth = lazy(() => import('./pages/Auth'));
const KYCForm = lazy(() => import('./pages/KYCForm'));
const Chat = lazy(() => import('./pages/Chat'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const TenantVerificationPortal = lazy(() => import('./pages/TenantVerificationPortal'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Global terms acceptance popup */}
        <TermsAcceptanceModal />
        <Suspense fallback={<main className="grid min-h-[50vh] place-items-center px-4 text-sm font-semibold text-slate-600" role="status">Loading TenTrust…</main>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/tenant" element={<TenantDashboard />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/apply/:propertyId" element={<KYCForm />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/check-tenant" element={<Navigate to="/dashboard?tab=verify-tenant" replace />} />
            <Route path="/verify-tenant" element={<Navigate to="/dashboard?tab=verify-tenant" replace />} />
            <Route path="/verify/:token" element={<TenantVerificationPortal />} />
            <Route path="/verify" element={<TenantVerificationPortal />} />
            <Route path="/tenant-check/:token" element={<TenantVerificationPortal />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
          </Routes>
        </Suspense>
        <AIChatbot />
      </BrowserRouter>
    </AuthProvider>
  );
}
