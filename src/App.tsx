/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing'));
const AuthRoutes = lazy(() => import('./AuthRoutes'));
const Chat = lazy(() => import('./pages/Chat'));
const TenantVerificationPortal = lazy(() => import('./pages/SandboxTenantPortal'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Pricing = lazy(() => import('./pages/Pricing'));

export default function App() {
  return (
    <BrowserRouter>
      {import.meta.env.VITE_DEMO_MODE === 'true' && <aside role="note" style={{background:'#fff4d6',color:'#5c3a00',borderBottom:'1px solid #e6c67c',padding:'12px 20px',textAlign:'center',fontSize:14,lineHeight:1.5}}><strong>TenTrust Sandbox demo</strong> · Paystack test payments · Mono sample identity data. Use test details only. No live verification or real payment.</aside>}
      <Suspense fallback={<main className="grid min-h-[50vh] place-items-center px-4 text-sm font-semibold text-slate-600" role="status">Loading TenTrust…</main>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/auth/*" element={<AuthRoutes />} />
          <Route path="/dashboard/*" element={<AuthRoutes />} />
          <Route path="/admin/*" element={<AuthRoutes />} />
          <Route path="/listings/*" element={<AuthRoutes />} />
          <Route path="/apply/*" element={<AuthRoutes />} />
          <Route path="/tenant" element={<Navigate to="/" replace />} />
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
    </BrowserRouter>
  );
}
