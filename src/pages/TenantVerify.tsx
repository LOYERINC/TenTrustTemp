import { useState } from 'react';
import { Link } from 'react-router-dom';
import Connect from '@mono.co/connect.js';
import { SCREENING_API_BASE } from '../lib/screeningApi';
import { supabase } from '../lib/supabase';
import {
  Shield,
  ArrowLeft,
  User,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChevronRight,
  AlertTriangle,
  BadgeCheck,
  TrendingUp,
  Landmark,
  ClipboardList,
  Info,
  RotateCcw,
  Building2,
  ExternalLink,
  Sparkles,
} from '../lib/icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | 'form'
  | 'kyc-loading'
  | 'kyc-result'
  | 'credit-loading'
  | 'credit-result'
  | 'mono-connect-loading'
  | 'mono-connect-result'
  | 'error';

interface KYCData {
  status: boolean;
  detail: string;
  response_code: string;
  data?: {
    bvn: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    gender?: string;
    date_of_birth?: string;
    phone_number?: string;
    state_of_origin?: string;
    watch_listed?: string;
    verification_status?: string;
  };
}

interface CreditFacility {
  financial_institution: string;
  facility_type: string;
  sanction_date: string;
  loan_amount: number;
  outstanding_balance: number;
  performance_status: string;
  repayment_frequency: string;
}

interface CreditData {
  status: string;
  message: string;
  data?: {
    bvn: string;
    provider: string;
    credit_score: number;
    rating: string;
    total_facilities: number;
    active_facilities: number;
    closed_facilities: number;
    total_outstanding_balance: number;
    total_overdue_balance: number;
    history: CreditFacility[];
  };
}

interface MonoConnectedAccount {
  id: string;
  name?: string;
  accountNumber?: string;
  type?: string;
  institution?: {
    name: string;
    bankCode: string;
  };
  balance?: number;
  currency?: string;
  bvn?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BACKEND = SCREENING_API_BASE;
const MONO_PUBLIC_KEY = import.meta.env.VITE_MONO_PUBLIC_KEY?.trim() || '';

async function authenticatedHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to continue this verification.');
  return { Authorization: `Bearer ${session.access_token}` };
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
}

function scoreColor(score: number) {
  if (score >= 700) return 'text-emerald-600';
  if (score >= 580) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number) {
  if (score >= 700) return 'bg-emerald-50 border-emerald-200';
  if (score >= 580) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function scoreLabel(rating: string) {
  const map: Record<string, string> = {
    Excellent: 'bg-emerald-100 text-emerald-800',
    Good: 'bg-emerald-50 text-emerald-700',
    Fair: 'bg-amber-50 text-amber-700',
    Poor: 'bg-red-50 text-red-700',
  };
  return map[rating] ?? 'bg-slate-100 text-slate-700';
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function StepIndicator({ stage }: { stage: Stage }) {
  const kycDone = ['kyc-result', 'credit-loading', 'credit-result', 'mono-connect-result'].includes(stage);
  const creditDone = stage === 'credit-result' || stage === 'mono-connect-result';
  const kycActive = ['form', 'kyc-loading', 'kyc-result'].includes(stage);
  const creditActive = ['credit-loading', 'credit-result', 'mono-connect-loading', 'mono-connect-result'].includes(stage);

  return (
    <div className="flex items-center gap-0 text-xs font-semibold">
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-l-full border ${
          kycActive
            ? 'bg-[#0747a6] text-white border-[#0747a6]'
            : kycDone
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}
      >
        {kycDone ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">
            1
          </span>
        )}
        KYC Verification
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 -mx-1" />
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-r-full border ${
          creditActive
            ? 'bg-[#0747a6] text-white border-[#0747a6]'
            : creditDone
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}
      >
        {creditDone ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">
            2
          </span>
        )}
        Mono Financial / Credit Check
      </div>
    </div>
  );
}

function Spinner({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-4 border-slate-100" />
        <div className="w-14 h-14 rounded-full border-4 border-t-[#0747a6] border-r-transparent border-b-transparent border-l-transparent absolute top-0 left-0 animate-spin" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{sublabel || 'Communicating with verification network…'}</p>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantVerify() {
  const [bvn, setBvn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [kycResult, setKycResult] = useState<KYCData | null>(null);
  const [creditResult, setCreditResult] = useState<CreditData | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<MonoConnectedAccount | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setBvn('');
    setFirstName('');
    setLastName('');
    setStage('form');
    setKycResult(null);
    setCreditResult(null);
    setConnectedAccount(null);
    setErrorMsg('');
  };

  // ── Step 1: Run KYC via Prembly ──────────────────────────────────────────

  const runKYC = async (e: React.FormEvent) => {
    e.preventDefault();
    setStage('kyc-loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${BACKEND}/api/prembly/verify-bvn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await authenticatedHeaders() },
        body: JSON.stringify({ bvn, first_name: firstName || undefined, last_name: lastName || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = typeof json.detail === 'object' ? json.detail?.message || JSON.stringify(json.detail) : json.detail;
        throw new Error(msg || 'KYC verification failed');
      }
      setKycResult(json);
      setStage('kyc-result');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Unable to connect to the verification service.');
      setStage('error');
    }
  };

  // ── Step 2: Run Credit Check via Mono API (BVN Bureau Lookup) ────────────

  const runCreditCheck = async () => {
    setStage('credit-loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${BACKEND}/api/mono/credit-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await authenticatedHeaders() },
        body: JSON.stringify({ bvn, provider: 'crc', reason: 'Tenant credit assessment by landlord' }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errorDetail = json.detail;
        const msg =
          typeof errorDetail === 'object'
            ? errorDetail?.message || errorDetail?.error?.message || JSON.stringify(errorDetail)
            : errorDetail;

        throw new Error(msg || 'Credit check failed.');
      }
      setCreditResult(json);
      setStage('credit-result');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Unexpected error during credit check.');
      setStage('error');
    }
  };

  // ── Step 2 Alt: Launch Mono Connect Widget (Live Bank Account Linking) ────

  const launchMonoConnect = () => {
    if (!MONO_PUBLIC_KEY) {
      setErrorMsg('Mono Connect is not configured. Set VITE_MONO_PUBLIC_KEY in the frontend environment.');
      setStage('error');
      return;
    }
    try {
      const monoConnect = new Connect({
        key: MONO_PUBLIC_KEY,
        scope: 'auth',
        data: {
          customer: {
            name: `${firstName || 'Prospective'} ${lastName || 'Tenant'}`.trim(),
            bvn: bvn || undefined,
          }
        },
        onSuccess: async ({ code }: { code: string }) => {
          setStage('mono-connect-loading');
          try {
            const res = await fetch(`${BACKEND}/api/mono/exchange-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...await authenticatedHeaders() },
              body: JSON.stringify({ code }),
            });
            const tokenData = await res.json();
            const accountId = tokenData?.id || tokenData?.account?._id;
            if (!res.ok || !accountId) throw new Error(tokenData?.detail?.message || 'Mono did not return a linked account.');

            let identityData: any = null;
            const idRes = await fetch(`${BACKEND}/api/mono/account/${accountId}/identity`, { headers: await authenticatedHeaders() });
            identityData = await idRes.json();
            if (!idRes.ok) throw new Error(identityData?.detail?.message || 'Mono linked the account, but its identity details could not be retrieved.');
            const identity = identityData?.data && typeof identityData.data === 'object' ? identityData.data : identityData;

            setConnectedAccount({
              id: accountId,
              name: identity?.full_name || identity?.fullName || undefined,
              accountNumber: identity?.account_number || identity?.accountNumber || undefined,
              institution: identity?.institution?.name ? {
                name: identity.institution.name,
                bankCode: identity.institution.bank_code || identity.institution.bankCode || '',
              } : undefined,
              bvn: identity?.bvn || undefined,
              balance: typeof identity?.balance === 'number' ? identity.balance : undefined,
              currency: 'NGN',
            });
            setStage('mono-connect-result');
          } catch (err: any) {
            setErrorMsg(`Mono Connect exchange error: ${err.message}`);
            setStage('error');
          }
        },
        onClose: () => {
          console.log('Mono Connect modal closed.');
        },
      });

      monoConnect.setup();
      monoConnect.open();
    } catch (err: any) {
      alert(`Could not launch Mono Connect: ${err.message}`);
    }
  };

  // ─── KYC Result Panel ───────────────────────────────────────────────────

  const KYCResultPanel = () => {
    if (!kycResult) return null;
    const d = kycResult.data;
    const passed = kycResult.status && kycResult.response_code === '00';

    return (
      <div className="space-y-5 animate-fadeIn">
        {/* Status Banner */}
        <div className={`flex items-start gap-4 p-5 rounded-2xl border ${passed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {passed ? (
            <BadgeCheck className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-8 h-8 text-red-500 shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`font-bold text-base ${passed ? 'text-emerald-900' : 'text-red-800'}`}>
              {passed ? 'Identity Verified' : 'Verification Failed'}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">{kycResult.detail}</p>
          </div>
          {d?.watch_listed && (
            <span
              className={`ml-auto shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                d.watch_listed === 'NO' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {d.watch_listed === 'NO' ? 'Not Watchlisted' : 'WATCHLISTED'}
            </span>
          )}
        </div>

        {/* Detail Grid */}
        {d && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Full Name', value: `${d.first_name} ${d.middle_name ?? ''} ${d.last_name}`.trim() },
              { label: 'BVN', value: d.bvn },
              { label: 'Gender', value: d.gender },
              { label: 'Date of Birth', value: d.date_of_birth },
              { label: 'Phone', value: d.phone_number },
              { label: 'State of Origin', value: d.state_of_origin },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-900 truncate">{value}</p>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Action Buttons */}
        {passed && (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Step 2 Options (Mono):</p>

            <button
              onClick={runCreditCheck}
              className="w-full flex items-center justify-center gap-2 bg-[#0747a6] hover:bg-[#063c8f] text-white py-3.5 px-6 rounded-2xl font-bold text-sm shadow-md shadow-[#0747a6]/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              1. Run Credit Bureau Check (Mono BVN Lookup)
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={launchMonoConnect}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-6 rounded-2xl font-bold text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              2. Connect Tenant Bank Account (Mono Connect Widget)
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Credit Result Panel ─────────────────────────────────────────────────

  const CreditResultPanel = () => {
    if (!creditResult?.data) return null;
    const d = creditResult.data;

    return (
      <div className="space-y-5 animate-fadeIn">
        {/* Score Card */}
        <div className={`p-5 rounded-2xl border ${scoreBg(d.credit_score)} flex items-center gap-5`}>
          <div className="text-center shrink-0">
            <p className={`text-5xl font-black tracking-tighter ${scoreColor(d.credit_score)}`}>{d.credit_score}</p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">Credit Score</p>
          </div>
          <div className="h-12 w-px bg-slate-200 shrink-0" />
          <div className="space-y-1.5">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${scoreLabel(d.rating)}`}>
              {d.rating}
            </span>
            <p className="text-xs text-slate-600 leading-relaxed">
              Provider: <strong>{d.provider?.toUpperCase()}</strong> — BVN: <strong>{d.bvn}</strong>
            </p>
            <p className="text-xs text-slate-500">{creditResult.message}</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Landmark, label: 'Total Facilities', value: d.total_facilities },
            { icon: TrendingUp, label: 'Active', value: d.active_facilities },
            { icon: CheckCircle2, label: 'Closed', value: d.closed_facilities },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
              <Icon className="w-4 h-4 text-[#0747a6] mx-auto mb-1" />
              <p className="text-lg font-black text-slate-900">{value}</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Outstanding Balance</p>
            <p className="text-base font-black text-slate-900">{fmt(d.total_outstanding_balance)}</p>
          </div>
          <div className={`rounded-xl p-4 border ${d.total_overdue_balance > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Overdue Balance</p>
            <p className={`text-base font-black ${d.total_overdue_balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {fmt(d.total_overdue_balance)}
            </p>
          </div>
        </div>

        {/* Credit History */}
        {d.history?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wider">
              <ClipboardList className="w-3.5 h-3.5" />
              Credit Bureau Records ({d.history.length} facilities)
            </h4>
            <div className="space-y-2">
              {d.history.map((facility, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{facility.financial_institution}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        facility.performance_status.toLowerCase().includes('performing') &&
                        !facility.performance_status.toLowerCase().includes('non')
                          ? 'bg-emerald-50 text-emerald-700'
                          : facility.performance_status.toLowerCase().includes('closed')
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {facility.performance_status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{facility.facility_type}</span>
                    <span>Sanctioned: {facility.sanction_date}</span>
                    <span>{facility.repayment_frequency}</span>
                  </div>
                  <div className="flex gap-4 text-xs font-semibold pt-1">
                    <span className="text-slate-700">Loan: {fmt(facility.loan_amount)}</span>
                    <span className={facility.outstanding_balance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                      Balance: {fmt(facility.outstanding_balance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Also offer Mono Connect */}
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-emerald-900">Want live bank statement & transaction signals?</p>
            <p className="text-[11px] text-emerald-700">Launch Mono Connect to link a sandbox bank account.</p>
          </div>
          <button
            onClick={launchMonoConnect}
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs"
          >
            Launch Mono Connect
          </button>
        </div>

        {/* Restart */}
        <button
          onClick={reset}
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-6 rounded-2xl font-bold text-sm border border-slate-200 transition-all active:scale-[0.98] cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Verify Another Tenant
        </button>
      </div>
    );
  };

  // ─── Mono Connect Linked Result Panel ────────────────────────────────────

  const MonoConnectResultPanel = () => {
    if (!connectedAccount) return null;
    return (
      <div className="space-y-5 animate-fadeIn">
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-4">
          <BadgeCheck className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-emerald-950 text-base">Mono Connect authorization complete</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Account details below were returned by Mono. Details the provider did not return are marked unavailable.
            </p>
          </div>
          <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
            Active Auth
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Financial Institution</p>
            <p className="text-sm font-bold text-slate-900">{connectedAccount.institution?.name || 'Not returned by provider'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Account Number</p>
            <p className="text-sm font-mono font-bold text-slate-900">{connectedAccount.accountNumber || 'Not returned by provider'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Account Name</p>
            <p className="text-sm font-semibold text-slate-900">{connectedAccount.name || 'Not returned by provider'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Available Balance</p>
            <p className="text-sm font-bold text-emerald-700">{connectedAccount.balance == null ? 'Not returned by provider' : fmt(connectedAccount.balance)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Linked BVN</p>
            <p className="text-sm font-mono text-slate-700">{connectedAccount.bvn || 'Not returned by provider'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Mono Account ID</p>
            <p className="text-xs font-mono text-slate-600 truncate">{connectedAccount.id}</p>
          </div>
        </div>

        <button
          onClick={reset}
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-6 rounded-2xl font-bold text-sm border border-slate-200 transition-all active:scale-[0.98] cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Verify Another Tenant
        </button>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans selection:bg-[#0747a6] selection:text-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/check-tenant"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0747a6] bg-slate-100 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0747a6] p-1.5 rounded-lg text-white">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-heading font-black text-xl text-[#0c2340]">
                TenTrust <span className="text-slate-400 font-normal text-sm">| Tenant Verification</span>
              </span>
            </div>
          </div>
          {stage !== 'form' && (
            <button
              onClick={reset}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start Over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── Left: Form / Results ── */}
          <div className="lg:col-span-7 space-y-6">
            {/* Page Title */}
            <div>
              <h1 className="text-2xl font-heading font-black text-[#0c2340] tracking-tight">Verify Prospective Tenant</h1>
              <p className="text-sm text-slate-500 mt-1">
                Conduct live identity KYC (Prembly) and financial credit scoring (Mono) for prospective tenants.
              </p>
            </div>

            {/* Step Indicator */}
            <StepIndicator stage={stage} />

            {/* ── Form Stage ── */}
            {stage === 'form' && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#0747a6]/10 rounded-xl">
                      <User className="w-5 h-5 text-[#0747a6]" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0c2340]">Step 1 — Tenant Identity (KYC)</h2>
                      <p className="text-xs text-slate-500">Enter 11-digit BVN to verify identity via Prembly</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#0747a6] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                    Step 1 of 2
                  </span>
                </div>

                <form onSubmit={runKYC} className="space-y-4">
                  {/* BVN */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      BVN (Bank Verification Number) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{11}"
                      maxLength={11}
                      placeholder="11-digit BVN e.g. 12345678901"
                      value={bvn}
                      onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/15 text-sm font-mono font-semibold outline-none transition-all bg-slate-50/50 focus:bg-white tracking-widest"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Must be exactly 11 numeric digits</p>
                  </div>

                  {/* Name (optional) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        First Name <span className="text-slate-400 font-normal normal-case">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="JOHN"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/15 text-sm font-medium outline-none transition-all bg-slate-50/50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Last Name <span className="text-slate-400 font-normal normal-case">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="DOE"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/15 text-sm font-medium outline-none transition-all bg-slate-50/50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
                    <Info className="w-4 h-4 text-[#0747a6] shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Providing full names enables Prembly to calculate an identity confidence match percentage against official bank records.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={bvn.length !== 11}
                    className="w-full flex items-center justify-center gap-2 bg-[#0747a6] hover:bg-[#063c8f] disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 px-6 rounded-2xl font-bold text-sm shadow-md shadow-[#0747a6]/20 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <BadgeCheck className="w-4 h-4" />
                    Run KYC Identity Check
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>

                {/* Direct Shortcut to Mono Connect */}
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Or test Mono Connect directly</p>
                      <p className="text-[11px] text-slate-500">Launch the official Mono Connect banking widget</p>
                    </div>
                    <button
                      type="button"
                      onClick={launchMonoConnect}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Test Mono Connect
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── KYC Loading ── */}
            {stage === 'kyc-loading' && (
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                <Spinner label="Verifying identity with Prembly…" sublabel="Checking BVN, name match, and watchlist status" />
              </div>
            )}

            {/* ── KYC Result ── */}
            {stage === 'kyc-result' && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <BadgeCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0c2340]">KYC Verification Result</h2>
                    <p className="text-xs text-slate-500">Validated via Prembly Identity Service</p>
                  </div>
                </div>
                <KYCResultPanel />
              </div>
            )}

            {/* ── Credit Loading ── */}
            {stage === 'credit-loading' && (
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                <Spinner label="Querying credit bureaus via Mono API…" sublabel="Paging CRC & XDS bureau databases" />
              </div>
            )}

            {/* ── Mono Connect Exchange Loading ── */}
            {stage === 'mono-connect-loading' && (
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                <Spinner label="Exchanging Mono authorization code…" sublabel="Securing account details from Mono" />
              </div>
            )}

            {/* ── Credit Result ── */}
            {stage === 'credit-result' && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-[#0747a6]/10 rounded-xl">
                    <CreditCard className="w-5 h-5 text-[#0747a6]" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0c2340]">Credit History Report</h2>
                    <p className="text-xs text-slate-500">Sourced via Mono Credit Bureau Lookup</p>
                  </div>
                </div>
                <CreditResultPanel />
              </div>
            )}

            {/* ── Mono Connect Result ── */}
            {stage === 'mono-connect-result' && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0c2340]">Connected Bank Account Details</h2>
                    <p className="text-xs text-slate-500">Authenticated via Mono Connect Widget</p>
                  </div>
                </div>
                <MonoConnectResultPanel />
              </div>
            )}

            {/* ── Error State ── */}
            {stage === 'error' && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-start gap-4 p-5 rounded-2xl bg-red-50 border border-red-200">
                  <AlertTriangle className="w-7 h-7 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900">Verification Error</p>
                    <p className="text-sm text-red-700 mt-0.5">{errorMsg}</p>

                  </div>
                </div>
                <button
                  onClick={reset}
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-6 rounded-2xl font-bold text-sm border border-slate-200 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* ── Right: Info Panel ── */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 sticky top-24">
              <h3 className="text-sm font-bold text-[#0c2340]">Configured Verification Providers</h3>

              <div className="space-y-3">
                {/* Mono Card */}
                <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-blue-100 text-[#0747a6]">
                        <CreditCard className="w-4 h-4" />
                      </span>
                      <p className="text-sm font-bold text-slate-900">Mono Integration</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MONO_PUBLIC_KEY ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {MONO_PUBLIC_KEY ? 'Public key configured' : 'Setup required'}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0747a6]" />
                      <strong>Credit History Lookup:</strong> Queries official CRC & XDS bureaus.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0747a6]" />
                      <strong>Mono Connect Widget:</strong> Links applicant bank account directly.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0747a6]" />
                      Bank linking key is kept in frontend environment settings.
                    </li>
                  </ul>
                  <button
                    onClick={launchMonoConnect}
                    className="w-full mt-1 bg-white hover:bg-blue-50 text-[#0747a6] border border-blue-200 py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Connect a bank account
                  </button>
                </div>

                {/* Prembly Card */}
                <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                        <BadgeCheck className="w-4 h-4" />
                      </span>
                      <p className="text-sm font-bold text-slate-900">Prembly (Identitypass)</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      KYC Active
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      BVN & NIN identity verification
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      Sanction & Watchlist checks
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  Testing Guide:
                </p>
                <p>
                  To test <strong>Mono Connect</strong>, click the button above. Select any bank (e.g., Access, GTBank) and use the sandbox credentials displayed in the widget modal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
