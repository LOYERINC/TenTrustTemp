import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Building, 
  TrendingUp, 
  AlertTriangle, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowUpRight, 
  FileText, 
  Database, 
  Lock, 
  LogOut, 
  UserCheck, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldAlert, 
  Sliders, 
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface VerificationItem {
  id: string;
  tenantName: string;
  tenantPhone: string;
  tenantBvn: string;
  landlordName: string;
  propertyTitle: string;
  packageName: string;
  score: number;
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'HIGH RISK';
  status: 'Approved' | 'Flagged' | 'Pending Review';
  date: string;
  amountPaid: number;
}

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'landlord' | 'tenant';
  verified: boolean;
  propertiesCount: number;
  screeningsCount: number;
  joinedDate: string;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'verifications' | 'users' | 'properties' | 'sql' | 'logs'>('verifications');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRating, setFilterRating] = useState<string>('all');
  const [copiedSql, setCopiedSql] = useState(false);

  // Mock initial data with option to pull from Supabase
  const [verifications, setVerifications] = useState<VerificationItem[]>([
    {
      id: 'VER-8901',
      tenantName: 'Emeka Nwosu',
      tenantPhone: '0803 456 7890',
      tenantBvn: '2234****891',
      landlordName: 'Oluwaseun Adebayo',
      propertyTitle: '3-Bed Luxury Apartment, Lekki Phase 1',
      packageName: 'Premium (₦12,000)',
      score: 88,
      rating: 'EXCELLENT',
      status: 'Approved',
      date: '2026-08-18',
      amountPaid: 12000,
    },
    {
      id: 'VER-8902',
      tenantName: 'Babatunde Fashola',
      tenantPhone: '0905 828 3054',
      tenantBvn: '2211****442',
      landlordName: 'Chief A. Adeleke',
      propertyTitle: '4-Bed Duplex, Victoria Island',
      packageName: 'Standard (₦7,000)',
      score: 42,
      rating: 'HIGH RISK',
      status: 'Flagged',
      date: '2026-08-17',
      amountPaid: 7000,
    },
    {
      id: 'VER-8903',
      tenantName: 'Chiamaka Eze',
      tenantPhone: '0812 345 6789',
      tenantBvn: '2245****903',
      landlordName: 'Dr. Folake Davies',
      propertyTitle: '2-Bed Terrace, Ikeja GRA',
      packageName: 'Premium (₦12,000)',
      score: 74,
      rating: 'GOOD',
      status: 'Approved',
      date: '2026-08-17',
      amountPaid: 12000,
    },
    {
      id: 'VER-8904',
      tenantName: 'Ibrahim Danjuma',
      tenantPhone: '0703 112 3344',
      tenantBvn: '2299****128',
      landlordName: 'Alhaji Musa Bello',
      propertyTitle: 'Serviced Studio, Yaba Tech Hub',
      packageName: 'Basic (₦3,000)',
      score: 55,
      rating: 'FAIR',
      status: 'Pending Review',
      date: '2026-08-16',
      amountPaid: 3000,
    },
    {
      id: 'VER-8905',
      tenantName: 'Damilola Adeleke',
      tenantPhone: '0809 998 8776',
      tenantBvn: '2288****551',
      landlordName: 'Oluwaseun Adebayo',
      propertyTitle: 'Waterfront Penthouse, Ikoyi',
      packageName: 'Premium (₦12,000)',
      score: 94,
      rating: 'EXCELLENT',
      status: 'Approved',
      date: '2026-08-16',
      amountPaid: 12000,
    },
  ]);

  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([
    {
      id: 'USR-101',
      name: 'Oluwaseun Adebayo',
      email: 'landlord@tentrust.ng',
      role: 'landlord',
      verified: true,
      propertiesCount: 4,
      screeningsCount: 18,
      joinedDate: '2026-01-12',
    },
    {
      id: 'USR-102',
      name: 'TenTrust SuperAdmin',
      email: 'admin@tentrust.ng',
      role: 'admin',
      verified: true,
      propertiesCount: 0,
      screeningsCount: 0,
      joinedDate: '2026-01-01',
    },
    {
      id: 'USR-103',
      name: 'Chukwudi Okafor',
      email: 'tenant@tentrust.ng',
      role: 'tenant',
      verified: true,
      propertiesCount: 0,
      screeningsCount: 3,
      joinedDate: '2026-02-04',
    },
    {
      id: 'USR-104',
      name: 'Dr. Folake Davies',
      email: 'folake.davies@lekki-estates.com',
      role: 'landlord',
      verified: true,
      propertiesCount: 12,
      screeningsCount: 42,
      joinedDate: '2026-03-10',
    },
  ]);

  const supabaseSqlSchema = `-- ========================================================
-- TenTrust Official Supabase Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ========================================================

-- 1. Create Profiles Table (Linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  first_name text,
  last_name text,
  role text default 'landlord' check (role in ('admin', 'landlord', 'tenant')),
  phone text,
  is_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create Properties Table
create table if not exists public.properties (
  id uuid default gen_random_uuid() primary key,
  landlord_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  location text not null,
  property_type text not null,
  rent_amount numeric not null,
  currency text default 'NGN',
  status text default 'Vacant' check (status in ('Vacant', 'Occupied', 'Under Review')),
  cover_image text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Create Tenant Verifications Table
create table if not exists public.verifications (
  id uuid default gen_random_uuid() primary key,
  landlord_id uuid references public.profiles(id) on delete set null,
  tenant_name text not null,
  tenant_phone text,
  tenant_bvn text,
  property_id uuid references public.properties(id) on delete set null,
  package_name text not null,
  price_paid numeric default 7000,
  trust_score integer check (trust_score between 0 and 100),
  rating text,
  recommendation text,
  status text default 'Approved' check (status in ('Approved', 'Flagged', 'Pending Review')),
  created_at timestamptz default now()
);

-- 4. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.verifications enable row level security;

-- 5. RLS Policies
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

create policy "Properties viewable by everyone" on public.properties for select using (true);
create policy "Landlords can manage own properties" on public.properties for all using (auth.uid() = landlord_id);

create policy "Verifications viewable by landlord or admin" on public.verifications for select 
using (auth.uid() = landlord_id or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 6. Trigger for Automatic Profile Creation on Auth Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role, is_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', 'User'),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'landlord'),
    coalesce(new.email_confirmed_at is not null, false)
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleApprove = (id: string) => {
    setVerifications(prev => prev.map(v => v.id === id ? { ...v, status: 'Approved' } : v));
  };

  const handleFlag = (id: string) => {
    setVerifications(prev => prev.map(v => v.id === id ? { ...v, status: 'Flagged' } : v));
  };

  const handleToggleUserRole = (userId: string) => {
    setPlatformUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const nextRole = u.role === 'admin' ? 'landlord' : u.role === 'landlord' ? 'tenant' : 'admin';
        return { ...u, role: nextRole };
      }
      return u;
    }));
  };

  const filteredVerifications = verifications.filter(item => {
    const matchesSearch = 
      item.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.landlordName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.propertyTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRating = filterRating === 'all' || item.rating === filterRating;
    return matchesSearch && matchesRating;
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      {/* Top Admin Navigation Header */}
      <header className="bg-[#0c2340] text-white h-20 border-b border-white/10 px-6 lg:px-10 flex items-center justify-between shrink-0 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="font-heading font-black text-xl tracking-tight text-white flex items-center gap-2">
                TenTrust <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">SuperAdmin</span>
              </span>
              <p className="text-[10px] text-slate-300 font-mono tracking-wider">INSTITUTIONAL INTELLIGENCE</p>
            </div>
          </Link>
        </div>

        {/* Center Quick Switch Tabs */}
        <div className="hidden md:flex items-center gap-1 bg-white/10 p-1.5 rounded-2xl border border-white/10 text-xs font-semibold">
          {[
            { id: 'verifications', label: 'Screening Queue', icon: ShieldCheck },
            { id: 'users', label: 'Users & Roles', icon: Users },
            { id: 'sql', label: 'Supabase SQL', icon: Database },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[#0c2340] font-bold shadow-sm'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Admin Controls */}
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors border border-white/10"
          >
            <Building className="w-3.5 h-3.5" /> Landlord Portal
          </Link>
          
          <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-xs font-bold font-heading">
              {user ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}` : 'SA'}
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-300 hover:text-red-400 hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-10 space-y-8">
        
        {/* Top Executive KPI Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Screening Revenue</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl sm:text-3xl font-heading font-black text-slate-900">₦34.2M</p>
            <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> +28% this month
            </p>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Verified Tenants</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0747a6] flex items-center justify-center"><UserCheck className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl sm:text-3xl font-heading font-black text-slate-900">4,890</p>
            <p className="text-xs text-slate-500 font-medium">99.8% Prediction Accuracy</p>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Active Landlords</span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"><Users className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl sm:text-3xl font-heading font-black text-slate-900">1,420</p>
            <p className="text-xs text-slate-500 font-medium">3,110 Units Managed</p>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Default Risk Prevented</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><ShieldAlert className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl sm:text-3xl font-heading font-black text-slate-900">187 Flagged</p>
            <p className="text-xs text-rose-600 font-semibold">₦142M Saved in Defaults</p>
          </div>
        </div>

        {/* TAB 1: SCREENING QUEUE & AUDITS */}
        {activeTab === 'verifications' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-6">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-heading font-bold text-slate-900">Tenant Screening Queue &amp; Audits</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Real-time Casiec BVN/NIN verification reports and composite risk analysis</p>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tenant, BVN, landlord..."
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0747a6]/20 focus:border-[#0747a6] w-52 sm:w-64"
                  />
                </div>

                <select
                  value={filterRating}
                  onChange={(e) => setFilterRating(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-700 focus:outline-none"
                >
                  <option value="all">All Ratings</option>
                  <option value="EXCELLENT">Excellent (75+)</option>
                  <option value="GOOD">Good (60-74)</option>
                  <option value="FAIR">Fair (45-59)</option>
                  <option value="HIGH RISK">High Risk (&lt;45)</option>
                </select>
              </div>
            </div>

            {/* Verifications Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-6">Tenant &amp; BVN</th>
                    <th className="py-3 px-6">Property &amp; Landlord</th>
                    <th className="py-3 px-6">Score &amp; Rating</th>
                    <th className="py-3 px-6">Package &amp; Fee</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVerifications.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900">{item.tenantName}</div>
                        <div className="text-xs text-slate-500 font-mono">{item.tenantBvn} • {item.tenantPhone}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-900 max-w-xs truncate">{item.propertyTitle}</div>
                        <div className="text-xs text-slate-500">Landlord: <span className="font-semibold text-slate-700">{item.landlordName}</span></div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className={`text-base font-heading font-black ${
                            item.score >= 75 ? 'text-emerald-600' : item.score >= 60 ? 'text-[#0747a6]' : item.score >= 45 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {item.score}/100
                          </span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.rating === 'EXCELLENT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            item.rating === 'GOOD' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            item.rating === 'FAIR' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {item.rating}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-xs font-semibold text-slate-900">{item.packageName}</div>
                        <div className="text-[11px] text-slate-500">{item.date}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                          item.status === 'Flagged' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {item.status === 'Approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.status === 'Flagged' ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {item.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                        {item.status !== 'Approved' && (
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg transition-colors"
                          >
                            Approve
                          </button>
                        )}
                        {item.status !== 'Flagged' && (
                          <button
                            onClick={() => handleFlag(item.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-colors"
                          >
                            Flag Risk
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: USER DIRECTORY & ROLE CONTROLS */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-6">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-heading font-bold text-slate-900">Platform Users &amp; Role Access</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Manage Landlord, Tenant, and SuperAdmin permissions</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-6">User / Email</th>
                    <th className="py-3 px-6">Assigned Role</th>
                    <th className="py-3 px-6">Verification Status</th>
                    <th className="py-3 px-6">Activity</th>
                    <th className="py-3 px-6">Member Since</th>
                    <th className="py-3 px-6 text-right">Role Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {platformUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold capitalize ${
                          u.role === 'admin' ? 'bg-[#0c2340] text-white' :
                          u.role === 'landlord' ? 'bg-blue-50 text-[#0747a6] border border-blue-200' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {u.role === 'admin' && <Lock className="w-3 h-3 text-amber-300" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" /> NDPR Verified
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-600">
                        {u.role === 'landlord' ? `${u.propertiesCount} Properties • ${u.screeningsCount} Screenings` : 'General Tenant Access'}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500">
                        {u.joinedDate}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleToggleUserRole(u.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                        >
                          Switch Role
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SUPABASE SQL SCHEMA ASSISTANT */}
        {activeTab === 'sql' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#0747a6] text-xs font-bold uppercase mb-2">
                    <Database className="w-3.5 h-3.5" /> Supabase Integration
                  </div>
                  <h2 className="text-2xl font-heading font-black text-slate-900">Supabase SQL Migrations &amp; Schema</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Project Ref: <code className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[#0747a6] font-bold">elsvzazxshrqzwtuappy</code>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => copyToClipboard(supabaseSqlSchema)}
                    className="inline-flex items-center gap-2 bg-[#0c2340] hover:bg-[#0747a6] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    {copiedSql ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Schema'}
                  </button>

                  <a
                    href="https://supabase.com/dashboard/project/elsvzazxshrqzwtuappy/sql"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all"
                  >
                    Open Supabase SQL Editor <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">How to Apply Schema:</h3>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 leading-relaxed">
                  <li>Click <strong>Copy SQL Schema</strong> above.</li>
                  <li>Click <strong>Open Supabase SQL Editor</strong> to open project <code>elsvzazxshrqzwtuappy</code>.</li>
                  <li>Paste the script and click <strong>Run</strong>.</li>
                  <li>All tables (<code>profiles</code>, <code>properties</code>, <code>verifications</code>), RLS policies, and user triggers will be created instantly.</li>
                </ol>
              </div>

              {/* Code Display */}
              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#0f1820]">
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#142027] border-b border-slate-800 text-xs text-slate-400 font-mono">
                  <span>schema.sql</span>
                  <span>PostgreSQL / Supabase</span>
                </div>
                <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-96 leading-relaxed">
                  {supabaseSqlSchema}
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
