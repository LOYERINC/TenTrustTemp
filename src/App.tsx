/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import TenantDashboard from './pages/TenantDashboard';
import Listings from './pages/Listings';
import Auth from './pages/Auth';
import KYCForm from './pages/KYCForm';
import Chat from './pages/Chat';
import CheckTenant from './pages/CheckTenant';
import AdminDashboard from './pages/AdminDashboard';
import { AuthProvider } from './context/AuthContext';
import AIChatbot from './components/AIChatbot';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/tenant" element={<TenantDashboard />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/apply/:propertyId" element={<KYCForm />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/check-tenant" element={<CheckTenant />} />
        </Routes>
        <AIChatbot />
      </BrowserRouter>
    </AuthProvider>
  );
}

