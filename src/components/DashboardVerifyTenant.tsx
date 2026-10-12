import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, ChevronRight, Copy, CreditCard, ExternalLink, Info, Link as LinkIcon, LoaderCircle, ShieldCheck, User, UserRoundPlus, XCircle } from '../lib/icons';
import { ScreeningApiError, ScreeningPackage, ReadinessScore, formatScreeningError, screeningApi } from '../lib/screeningApi';
import { redirectToPaymentCheckout } from '../lib/paymentCheckout';

interface Property {
  id: string;
  title: string;
  location?: string;
  rentAmount?: number;
}

interface DashboardVerifyTenantProps {
  properties: Property[];
  onNavigateToReview?: () => void;
}

interface ScreeningHistoryItem {
  id: string;
  package_id: string;
  intake_mode: IntakeMode;
  tenant_name: string;
  tenant_phone: string;
  tenant_email?: string | null;
  property_title: string;
  status: string;
  payment_status: string;
  check_status?: Record<string, string> | null;
  monthly_rent?: number | null;
  monthly_income?: number | null;
  on_time_payments?: number | null;
  total_payments?: number | null;
  income_evidence?: boolean;
  rental_reference?: boolean;
  payment_reference?: string | null;
  score: ReadinessScore | null;
  created_at: string;
}

type IntakeMode = 'direct' | 'tenant_link';
type PageState = 'packages' | 'details' | 'paid' | 'processing' | 'complete' | 'link_ready';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600';

export default function DashboardVerifyTenant({ properties }: DashboardVerifyTenantProps) {
  const [packages, setPackages] = useState<ScreeningPackage[]>([]);
  const [premiumCredits, setPremiumCredits] = useState(0);
  const [history, setHistory] = useState<ScreeningHistoryItem[]>([]);
  const [useBundleCredit, setUseBundleCredit] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('basic');
  const [mode, setMode] = useState<IntakeMode>('direct');
  const [pageState, setPageState] = useState<PageState>('packages');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [screeningPropertyTitle, setScreeningPropertyTitle] = useState('');
  const [monthlyRent, setMonthlyRent] = useState(properties[0]?.rentAmount ? String(properties[0].rentAmount / 12) : '');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [onTimePayments, setOnTimePayments] = useState('');
  const [totalPayments, setTotalPayments] = useState('');
  const [incomeEvidence, setIncomeEvidence] = useState(false);
  const [rentalReference, setRentalReference] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [bvn, setBvn] = useState('');
  const [processingConsent, setProcessingConsent] = useState(false);
  const [screeningId, setScreeningId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [tenantLink, setTenantLink] = useState('');
  const [score, setScore] = useState<ReadinessScore | null>(null);
  const [checkStatus, setCheckStatus] = useState<Record<string, string>>({});
  const [screeningStatusMessage, setScreeningStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedPackage = useMemo(() => packages.find((pkg) => pkg.id === selectedPackageId), [packages, selectedPackageId]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const needsProviderCheck = selectedPackage?.checks.some((check) => check === 'identity' || check === 'credit_bureau' || check === '3_premium_checks');
  const providerCheckEntries = Object.entries(checkStatus).filter(([key]) => key !== 'readiness_score');
  const reportSources = Object.entries(score?.input_sources || {});

  const validateScreeningInput = () => {
    const errors: Record<string, string> = {};
    if (tenantName.trim().length < 2) errors.tenant_name = 'Enter the tenant’s full name (at least 2 characters).';
    if (tenantPhone.trim().length < 6) errors.tenant_phone = 'Enter a phone number with at least 6 characters.';
    if (tenantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail.trim())) {
      errors.tenant_email = 'Enter a valid email address or leave this field blank.';
    }

    if (mode === 'direct') {
      if (!Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) <= 0 || Number(monthlyRent) > 1_000_000_000) errors.monthly_rent = 'Enter a monthly rent above zero and no more than ₦1,000,000,000.';
      if (!Number.isFinite(Number(monthlyIncome)) || Number(monthlyIncome) <= 0 || Number(monthlyIncome) > 1_000_000_000) errors.monthly_income = 'Enter a monthly income above zero and no more than ₦1,000,000,000.';
      if (!consentConfirmed) errors.consent = 'Confirm the tenant has consented before submitting their details.';

      const hasOnTime = onTimePayments.trim() !== '';
      const hasTotal = totalPayments.trim() !== '';
    if (hasOnTime !== hasTotal) {
        if (!hasOnTime) errors.on_time_payments = 'Enter both payment counts or leave both blank.';
        if (!hasTotal) errors.total_payments = 'Enter both payment counts or leave both blank.';
    } else if (hasOnTime && hasTotal) {
        const onTime = Number(onTimePayments);
        const total = Number(totalPayments);
        if (!Number.isInteger(onTime) || onTime < 0 || onTime > 12) errors.on_time_payments = 'Use a whole number from 0 to 12.';
        if (!Number.isInteger(total) || total < 0 || total > 12) errors.total_payments = 'Use a whole number from 0 to 12.';
        if (Number.isInteger(onTime) && Number.isInteger(total) && onTime > total) {
          errors.on_time_payments = 'On-time payments cannot exceed total payments.';
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const refreshHistory = async () => {
    try {
      const result = await screeningApi<{ screenings: ScreeningHistoryItem[] }>('/api/screenings?limit=20');
      setHistory(result.screenings);
    } catch {
      setHistory([]);
    }
  };

  const showPaidScreening = async (id: string, reference = '') => {
    setPageState('processing');
    setError('');
    const record = await screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(id)}`);
    setScreeningId(id);
    setSelectedPackageId(record.package_id);
    setPaymentReference(reference || record.payment_reference || 'Payment confirmed');
    setMode(record.intake_mode);
    setTenantName(record.tenant_name);
    setTenantPhone(record.tenant_phone);
    setTenantEmail(record.tenant_email || '');
    setScreeningPropertyTitle(record.property_title);
    setMonthlyRent(record.monthly_rent == null ? '' : String(record.monthly_rent));
    setMonthlyIncome(record.monthly_income == null ? '' : String(record.monthly_income));
    setOnTimePayments(record.on_time_payments == null ? '' : String(record.on_time_payments));
    setTotalPayments(record.total_payments == null ? '' : String(record.total_payments));
    setIncomeEvidence(!!record.income_evidence);
    setRentalReference(!!record.rental_reference);
    setCheckStatus(record.check_status || {});
    setProcessingConsent(record.intake_mode === 'direct');

    if (record.status === 'complete' && record.score) {
      setScore(record.score);
      setPageState('complete');
      await refreshHistory();
      return;
    }

    if (record.intake_mode === 'direct') {
      const { packages: catalog } = await screeningApi<{ packages: ScreeningPackage[] }>('/api/screenings/packages', {}, false);
      const selected = catalog.find((item) => item.id === record.package_id);
      const scoreOnlyPackage = selected?.checks.every((check) => check === 'readiness_score');
      if (scoreOnlyPackage) {
        try {
          const result = await screeningApi<{ status: string; score: ReadinessScore; check_status: Record<string, string> }>(
            `/api/screenings/${encodeURIComponent(id)}/complete`,
            { method: 'POST', body: JSON.stringify({
              tenant_name: record.tenant_name,
              tenant_phone: record.tenant_phone,
              tenant_email: record.tenant_email || null,
              monthly_rent: Number(record.monthly_rent),
              monthly_income: Number(record.monthly_income),
              on_time_payments: record.total_payments == null ? null : Number(record.on_time_payments || 0),
              total_payments: record.total_payments == null ? null : Number(record.total_payments),
              income_evidence: !!record.income_evidence,
              rental_reference: !!record.rental_reference,
              consent: true,
            }) },
          );
          setScore(result.score);
          setCheckStatus(result.check_status);
          setPageState('complete');
          await refreshHistory();
          return;
        } catch (requestError) {
          setPageState('paid');
          setError(formatScreeningError(requestError));
          return;
        }
      }
    }

    setPageState('paid');
  };

  useEffect(() => {
    screeningApi<{ packages: ScreeningPackage[] }>('/api/screenings/packages', {}, false)
      .then(({ packages: availablePackages }) => {
        setPackages(availablePackages);
        if (!availablePackages.some((pkg) => pkg.id === selectedPackageId && pkg.enabled)) {
          const firstEnabled = availablePackages.find((pkg) => pkg.enabled);
          if (firstEnabled) setSelectedPackageId(firstEnabled.id);
        }
      })
      .catch((requestError) => setError(formatScreeningError(requestError)));
    screeningApi<{ premium_credits: number }>('/api/screenings/credits')
      .then(({ premium_credits }) => setPremiumCredits(premium_credits))
      .catch(() => setPremiumCredits(0));
    refreshHistory();
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const returnedScreeningId = query.get('screening');
    const reference = query.get('reference') || query.get('tx_ref');
    if (!returnedScreeningId || !reference) return;
    setScreeningId(returnedScreeningId);
    setPaymentReference(reference);
    setBusy(true);
    screeningApi<{ status: string; tenant_url?: string; payment_status: string; screening_id: string }>(
      `/api/screenings/${encodeURIComponent(returnedScreeningId)}/verify-payment?reference=${encodeURIComponent(reference)}`,
      { method: 'POST' },
    ).then(async (result) => {
      if (result.payment_status !== 'paid') throw new Error('Payment is not confirmed yet. Please refresh this page in a moment.');
      if (result.tenant_url) {
        const record = await screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(returnedScreeningId)}`);
        setSelectedPackageId(record.package_id);
        setTenantName(record.tenant_name);
        setTenantPhone(record.tenant_phone);
        setTenantEmail(record.tenant_email || '');
        setScreeningPropertyTitle(record.property_title);
        setTenantLink(result.tenant_url);
        setPageState('link_ready');
        void refreshHistory();
      } else {
        await showPaidScreening(returnedScreeningId, reference);
      }
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('screening');
      cleanUrl.searchParams.delete('reference');
      cleanUrl.searchParams.delete('tx_ref');
      window.history.replaceState({}, '', cleanUrl);
    }).catch((requestError) => {
      setPageState('packages');
      setError(formatScreeningError(requestError));
      void refreshHistory();
    }).finally(() => setBusy(false));
  }, []);

  const beginCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!validateScreeningInput()) {
      setError('Please correct the highlighted fields before continuing.');
      return;
    }
    if (!selectedPackage?.enabled) {
      setError(selectedPackage?.unavailable_reason || 'This package is not available right now.');
      return;
    }

    setBusy(true);
    try {
      const created = await screeningApi<{ screening_id: string; status?: string; payment_status?: string; tenant_url?: string }>('/api/screenings', {
        method: 'POST',
        body: JSON.stringify({
          package_id: selectedPackage.id,
          intake_mode: mode,
          tenant_name: tenantName,
          tenant_phone: tenantPhone,
          tenant_email: tenantEmail || null,
          property_id: propertyId || null,
          property_title: selectedProperty?.title || 'Rental application',
          monthly_rent: mode === 'direct' ? Number(monthlyRent) : null,
          monthly_income: mode === 'direct' ? Number(monthlyIncome) : null,
          on_time_payments: mode === 'direct' && totalPayments ? Number(onTimePayments || 0) : null,
          total_payments: mode === 'direct' && totalPayments ? Number(totalPayments) : null,
          income_evidence: mode === 'direct' && incomeEvidence,
          rental_reference: mode === 'direct' && rentalReference,
          landlord_confirms_consent: mode === 'direct' && consentConfirmed,
          use_bundle_credit: selectedPackage.id === 'premium' && useBundleCredit,
        }),
      });
      setScreeningId(created.screening_id);
      if (created.tenant_url) {
        setTenantLink(created.tenant_url);
        setPageState('link_ready');
        setBusy(false);
        setPremiumCredits((value) => Math.max(0, value - 1));
        return;
      }
      if (created.payment_status === 'paid') {
        setPaymentReference('Founding Member Premium credit');
        setPageState('paid');
        setBusy(false);
        setPremiumCredits((value) => Math.max(0, value - 1));
        return;
      }
      const checkout = await screeningApi<{ authorization_url: string; reference: string }>(
        `/api/screenings/${encodeURIComponent(created.screening_id)}/checkout`,
        { method: 'POST' },
      );
      setPaymentReference(checkout.reference);
      if (!checkout.authorization_url) throw new Error('Checkout did not return a payment link. Please retry.');
      redirectToPaymentCheckout(checkout.authorization_url);
    } catch (requestError) {
      setError(formatScreeningError(requestError));
      setBusy(false);
    }
  };

  const completeDirectScreening = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (needsProviderCheck && bvn.length !== 11) {
      setError('Enter the tenant’s 11-digit BVN to run the checks included in this package.');
      return;
    }
    if (!processingConsent) {
      setError('Confirm the tenant has authorized processing before running the check.');
      return;
    }
    setBusy(true);
    setPageState('processing');
    try {
      const result = await screeningApi<{ status: string; score: ReadinessScore; check_status: Record<string, string> }>(
        `/api/screenings/${encodeURIComponent(screeningId)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            tenant_name: tenantName,
            tenant_phone: tenantPhone,
            tenant_email: tenantEmail || null,
            monthly_rent: Number(monthlyRent),
            monthly_income: Number(monthlyIncome),
            on_time_payments: totalPayments ? Number(onTimePayments || 0) : null,
            total_payments: totalPayments ? Number(totalPayments) : null,
            income_evidence: incomeEvidence,
            rental_reference: rentalReference,
            bvn: bvn || null,
            consent: processingConsent,
          }),
        },
      );
      setScore(result.score);
      setCheckStatus(result.check_status);
      setPageState('complete');
      await refreshHistory();
    } catch (requestError) {
      if (requestError instanceof ScreeningApiError) {
        const detail = requestError.detail as { check_status?: Record<string, string> } | undefined;
        if (detail?.check_status) setCheckStatus(detail.check_status);
      }
      setError(formatScreeningError(requestError));
      setPageState('paid');
    } finally {
      setBusy(false);
    }
  };

  const copyTenantLink = async () => {
    try {
      await navigator.clipboard.writeText(tenantLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Select and copy the tenant link manually.');
    }
  };

  const checkTenantSubmission = async () => {
    setBusy(true);
    setError('');
    setScreeningStatusMessage('');
    try {
      const record = await screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(screeningId)}`);
      setCheckStatus(record.check_status || {});
      if (record.status === 'complete' && record.score) {
        setScore(record.score);
        setPageState('complete');
      } else {
        setScreeningStatusMessage('The tenant has not completed the secure form yet. The report will be available here after they submit it.');
      }
      await refreshHistory();
    } catch (requestError) {
      setError(formatScreeningError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const resumeScreening = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const record = await screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(id)}`);
      setScreeningId(id);
      setSelectedPackageId(record.package_id);
      setMode(record.intake_mode);
      setTenantName(record.tenant_name);
      setTenantPhone(record.tenant_phone);
      setTenantEmail(record.tenant_email || '');
      setScreeningPropertyTitle(record.property_title);
      setMonthlyRent(record.monthly_rent ? String(record.monthly_rent) : '');
      setMonthlyIncome(record.monthly_income ? String(record.monthly_income) : '');
      setOnTimePayments(record.on_time_payments == null ? '' : String(record.on_time_payments));
      setTotalPayments(record.total_payments == null ? '' : String(record.total_payments));
      setIncomeEvidence(!!record.income_evidence);
      setRentalReference(!!record.rental_reference);
      setCheckStatus(record.check_status || {});
      if (record.status === 'complete' && record.score) {
        setScore(record.score);
        setPageState('complete');
      } else if (record.payment_status === 'paid' && record.intake_mode === 'tenant_link') {
        const result = await screeningApi<{ tenant_url: string }>(`/api/screenings/${encodeURIComponent(id)}/tenant-link`, { method: 'POST' });
        setTenantLink(result.tenant_url);
        setPageState('link_ready');
      } else if (record.payment_status === 'paid') {
        await showPaidScreening(id, record.payment_reference || '');
      } else {
        const checkout = await screeningApi<{ authorization_url: string }>(`/api/screenings/${encodeURIComponent(id)}/checkout`, { method: 'POST' });
        if (!checkout.authorization_url) throw new Error('Checkout did not return a payment link. Please retry.');
        redirectToPaymentCheckout(checkout.authorization_url);
      }
      await refreshHistory();
    } catch (requestError) {
      setError(formatScreeningError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPageState('packages');
    setTenantName(''); setTenantPhone(''); setTenantEmail(''); setMonthlyRent(selectedProperty?.rentAmount ? String(selectedProperty.rentAmount / 12) : ''); setMonthlyIncome(''); setOnTimePayments(''); setTotalPayments('');
    setIncomeEvidence(false); setRentalReference(false); setConsentConfirmed(false); setProcessingConsent(false); setBvn('');
    setScreeningId(''); setPaymentReference(''); setTenantLink(''); setScore(null); setCheckStatus({}); setFieldErrors({}); setScreeningStatusMessage(''); setUseBundleCredit(false); setScreeningPropertyTitle(''); setError('');
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="brand-banner-art px-6 py-7 text-white md:px-9">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"><ShieldCheck className="h-4 w-4" /> Tenant screening</div>
        <h2 className="text-2xl font-extrabold md:text-3xl">{pageState === 'complete' ? 'Screening report' : pageState === 'link_ready' ? 'Tenant link ready' : pageState === 'paid' || pageState === 'processing' ? 'Your screening is underway' : 'Choose a screening package'}</h2>
        <p className="mt-2 max-w-2xl text-sm text-blue-100">{pageState === 'complete' ? 'Review the advisory score, supporting factors, and any separate provider checks.' : pageState === 'link_ready' ? 'Send the secure link to the tenant. The report will appear here after they submit their information and consent.' : pageState === 'paid' || pageState === 'processing' ? 'Payment is confirmed. We’ll show the report as soon as the required information and checks are ready.' : 'Enter tenant details, pay securely, and follow the screening through to its report.'}</p>
      </div>

      <div className="space-y-7 p-5 md:p-9">
        {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><XCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}

        {pageState === 'packages' && <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">1. Select what you need</h3><p className="mt-1 text-xs text-slate-500">Current prices are temporary launch defaults.</p></div>
            <span className="font-label rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-900">STEP 1 OF 3</span>
          </div>
          {!packages.length && !error && <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading available packages…</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {packages.map((pkg) => <button key={pkg.id} type="button" disabled={!pkg.enabled || busy} onClick={() => setSelectedPackageId(pkg.id)} className={`rounded-2xl border p-4 text-left transition ${pkg.id === selectedPackageId ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'} ${!pkg.enabled ? 'cursor-not-allowed opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-bold text-slate-900">{pkg.name}</div><p className="mt-1 text-xs leading-5 text-slate-600">{pkg.description}</p></div><div className="whitespace-nowrap text-sm font-black text-blue-800">₦{pkg.price.toLocaleString()}</div></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{pkg.checks.map((check) => <span key={check} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{check.replaceAll('_', ' ')}</span>)}</div>
              {!pkg.enabled && <p className="mt-3 text-xs font-semibold text-amber-800">Unavailable: {pkg.unavailable_reason}</p>}
            </button>)}
          </div>
          <button type="button" disabled={!selectedPackage?.enabled} onClick={() => { setError(''); setPageState('details'); }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Continue to tenant details <ChevronRight className="h-4 w-4" /></button>
        </div>}

        {pageState === 'details' && <form noValidate onSubmit={beginCheckout} className="space-y-6">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">2. Add tenant information</h3><p className="mt-1 text-xs text-slate-500">{selectedPackage?.name} · ₦{selectedPackage?.price.toLocaleString()}</p></div><button type="button" onClick={() => setPageState('packages')} className="text-xs font-semibold text-blue-700 hover:underline">Change package</button></div>

          <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Choose how to collect screening details</legend><div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setMode('direct')} className={`rounded-2xl border p-4 text-left ${mode === 'direct' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><div className="flex items-center gap-2 font-bold text-slate-900"><User className="h-4 w-4" /> I’ll enter the details</div><p className="mt-1 text-xs leading-5 text-slate-600">You enter the tenant’s rental and affordability details.</p></button>
            <button type="button" onClick={() => setMode('tenant_link')} className={`rounded-2xl border p-4 text-left ${mode === 'tenant_link' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><div className="flex items-center gap-2 font-bold text-slate-900"><UserRoundPlus className="h-4 w-4" /> Tenant fills a secure link</div><p className="mt-1 text-xs leading-5 text-slate-600">After payment, share a private link for the tenant to provide details and consent.</p></button>
          </div></fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="tenant-name" className={labelClass}>Tenant full name *</label><input id="tenant-name" required minLength={2} maxLength={160} aria-invalid={Boolean(fieldErrors.tenant_name)} aria-describedby={fieldErrors.tenant_name ? 'tenant-name-error' : undefined} value={tenantName} onChange={(event) => { setTenantName(event.target.value); clearFieldError('tenant_name'); }} className={`${inputClass} ${fieldErrors.tenant_name ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="name" />{fieldErrors.tenant_name && <p id="tenant-name-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_name}</p>}</div>
            <div><label htmlFor="tenant-phone" className={labelClass}>Phone number *</label><input id="tenant-phone" required minLength={6} maxLength={40} aria-invalid={Boolean(fieldErrors.tenant_phone)} aria-describedby={fieldErrors.tenant_phone ? 'tenant-phone-error' : undefined} value={tenantPhone} onChange={(event) => { setTenantPhone(event.target.value); clearFieldError('tenant_phone'); }} className={`${inputClass} ${fieldErrors.tenant_phone ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="tel" />{fieldErrors.tenant_phone && <p id="tenant-phone-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_phone}</p>}</div>
            <div><label htmlFor="tenant-email" className={labelClass}>Tenant email (optional)</label><input id="tenant-email" type="email" maxLength={200} aria-invalid={Boolean(fieldErrors.tenant_email)} aria-describedby={fieldErrors.tenant_email ? 'tenant-email-error' : undefined} value={tenantEmail} onChange={(event) => { setTenantEmail(event.target.value); clearFieldError('tenant_email'); }} className={`${inputClass} ${fieldErrors.tenant_email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="email" />{fieldErrors.tenant_email && <p id="tenant-email-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_email}</p>}</div>
            <div><label className={labelClass}>Property</label><select value={propertyId} onChange={(event) => { const value = event.target.value; setPropertyId(value); const property = properties.find((item) => item.id === value); if (property?.rentAmount) setMonthlyRent(String(property.rentAmount / 12)); }} className={inputClass}><option value="">General rental application</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></div>
          </div>

          {mode === 'direct' && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="monthly-rent" className={labelClass}>Monthly rent (₦) *</label><input id="monthly-rent" required min="0.01" max="1000000000" step="any" type="number" aria-invalid={Boolean(fieldErrors.monthly_rent)} aria-describedby={fieldErrors.monthly_rent ? 'monthly-rent-error' : undefined} value={monthlyRent} onChange={(event) => { setMonthlyRent(event.target.value); clearFieldError('monthly_rent'); }} className={`${inputClass} ${fieldErrors.monthly_rent ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{fieldErrors.monthly_rent && <p id="monthly-rent-error" className="mt-1 text-xs text-rose-700">{fieldErrors.monthly_rent}</p>}</div>
              <div><label htmlFor="monthly-income" className={labelClass}>Tenant monthly income (₦) *</label><input id="monthly-income" required min="0.01" max="1000000000" step="any" type="number" aria-invalid={Boolean(fieldErrors.monthly_income)} aria-describedby={fieldErrors.monthly_income ? 'monthly-income-error' : undefined} value={monthlyIncome} onChange={(event) => { setMonthlyIncome(event.target.value); clearFieldError('monthly_income'); }} className={`${inputClass} ${fieldErrors.monthly_income ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{fieldErrors.monthly_income && <p id="monthly-income-error" className="mt-1 text-xs text-rose-700">{fieldErrors.monthly_income}</p>}</div>
              <div><label htmlFor="on-time-payments" className={labelClass}>On-time rental payments (past 12)</label><input id="on-time-payments" min="0" max="12" step="1" type="number" aria-invalid={Boolean(fieldErrors.on_time_payments)} aria-describedby={fieldErrors.on_time_payments ? 'on-time-payments-error' : undefined} value={onTimePayments} onChange={(event) => { setOnTimePayments(event.target.value); clearFieldError('on_time_payments'); }} className={`${inputClass} ${fieldErrors.on_time_payments ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} placeholder="Leave both blank if unavailable" />{fieldErrors.on_time_payments && <p id="on-time-payments-error" className="mt-1 text-xs text-rose-700">{fieldErrors.on_time_payments}</p>}</div>
              <div><label htmlFor="total-payments" className={labelClass}>Total rental payments (past 12)</label><input id="total-payments" min="0" max="12" step="1" type="number" aria-invalid={Boolean(fieldErrors.total_payments)} aria-describedby={fieldErrors.total_payments ? 'total-payments-error' : undefined} value={totalPayments} onChange={(event) => { setTotalPayments(event.target.value); clearFieldError('total_payments'); }} className={`${inputClass} ${fieldErrors.total_payments ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} placeholder="e.g. 12" />{fieldErrors.total_payments && <p id="total-payments-error" className="mt-1 text-xs text-rose-700">{fieldErrors.total_payments}</p>}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={incomeEvidence} onChange={(event) => setIncomeEvidence(event.target.checked)} className="mt-0.5 accent-blue-700" />Income evidence is available</label><label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={rentalReference} onChange={(event) => setRentalReference(event.target.checked)} className="mt-0.5 accent-blue-700" />A rental reference is available</label></div>
            <div><label className={`flex items-start gap-3 rounded-2xl border p-4 text-xs leading-5 ${fieldErrors.consent ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><input id="tenant-consent" required type="checkbox" aria-invalid={Boolean(fieldErrors.consent)} aria-describedby={fieldErrors.consent ? 'tenant-consent-error' : undefined} checked={consentConfirmed} onChange={(event) => { setConsentConfirmed(event.target.checked); clearFieldError('consent'); }} className="mt-1 accent-amber-700" /><span>I confirm the tenant has given informed permission for TenTrust to process information for this specific rental screening. I will not submit identity details unless that consent has been obtained.</span></label>{fieldErrors.consent && <p id="tenant-consent-error" className="mt-1 text-xs text-rose-700">{fieldErrors.consent}</p>}</div>
          </>}

          {mode === 'tenant_link' && <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />The tenant will enter income, rent history, supporting evidence information, and their consent on a secure link after payment. Identity details are requested only for packages that include an identity or credit check.</div>}

          {selectedPackage?.id === 'premium' && premiumCredits > 0 && <label className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><input type="checkbox" checked={useBundleCredit} onChange={(event) => setUseBundleCredit(event.target.checked)} className="accent-emerald-700" /><span>Use one of your <strong>{premiumCredits}</strong> Founding Member Premium credits instead of paying again.</span></label>}

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={() => setPageState('packages')} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Back</button><button type="submit" disabled={busy || !selectedPackage?.enabled} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"><CreditCard className="h-4 w-4" />{busy ? 'Starting secure checkout…' : `Pay ₦${selectedPackage?.price.toLocaleString()} and continue`}</button></div>
        </form>}

        {pageState === 'paid' && <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-bold">Payment confirmed</div><div className="mt-1 text-xs">{tenantName} · {screeningPropertyTitle || selectedProperty?.title || 'Rental application'} · reference {paymentReference}</div></div></div>
          <form onSubmit={completeDirectScreening} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div><h3 className="font-bold text-slate-900">{needsProviderCheck ? 'One last step: provide the tenant’s BVN' : 'Finish generating the readiness report'}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{needsProviderCheck ? 'This package includes identity or credit checks. The BVN is sent securely to the configured provider for this request and is not stored in the screening record. The readiness score remains separate from provider results.' : 'Your payment and consent are recorded. Retry report generation to continue; you will not be charged again.'}</p></div>
            {needsProviderCheck && <div><label htmlFor="paid-tenant-bvn" className={labelClass}>Tenant BVN *</label><input id="paid-tenant-bvn" required inputMode="numeric" pattern="[0-9]{11}" maxLength={11} value={bvn} onChange={(event) => setBvn(event.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="11 digits" /><p className="mt-1 text-[11px] text-slate-500">Only enter this after the tenant has consented to the included provider check.</p></div>}
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={processingConsent} onChange={(event) => setProcessingConsent(event.target.checked)} className="mt-0.5 accent-blue-700" />I confirm the tenant’s consent still covers these checks and the information is accurate.</label>
            <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{busy ? 'Preparing the report…' : needsProviderCheck ? 'Run provider checks and create report' : 'Retry report generation'}</button>
          </form>
          {providerCheckEntries.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h4 className="text-sm font-bold text-amber-950">Check status</h4><p className="mt-1 text-xs text-amber-900">A report is created after required provider checks finish. Failed or unavailable checks are never shown as verified.</p>{providerCheckEntries.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-t border-amber-200 py-2 text-xs capitalize text-amber-950"><span>{key.replaceAll('_', ' ')}</span><span className="text-right font-semibold">{value.replaceAll('_', ' ')}</span></div>)}</div>}
        </div>}

        {pageState === 'processing' && <div className="flex flex-col items-center gap-3 py-10 text-center"><LoaderCircle className="h-9 w-9 animate-spin text-blue-700" /><p className="font-bold text-slate-900">Processing the screening</p><p className="max-w-md text-sm text-slate-600">No result will be shown as verified unless the selected provider check succeeds.</p></div>}

        {pageState === 'link_ready' && <div className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3 text-emerald-900"><CheckCircle2 className="h-6 w-6" /><div><h3 className="font-bold">Payment confirmed · tenant link ready</h3><p className="text-xs">The link expires in seven days and can be used once.</p></div></div>
          <div className="flex flex-col gap-2 sm:flex-row"><input readOnly value={tenantLink} className={`${inputClass} font-mono text-xs`} /><button type="button" onClick={copyTenantLink} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">{copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}</button></div>
          {screeningStatusMessage && <p role="status" className="rounded-xl border border-blue-100 bg-white p-3 text-xs leading-5 text-blue-900">{screeningStatusMessage}</p>}
          <div className="flex flex-wrap items-center gap-3"><a href={`https://wa.me/${tenantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Please complete your TenTrust tenant screening using this secure link: ${tenantLink}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white"><LinkIcon className="h-4 w-4" />Share via WhatsApp</a><a href={tenantLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700"><ExternalLink className="h-4 w-4" />Preview tenant form</a><button type="button" disabled={busy} onClick={() => void checkTenantSubmission()} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-800 disabled:opacity-50">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Check for report</button><button type="button" onClick={reset} className="ml-auto text-xs font-semibold text-slate-600 hover:underline">Start another screening</button></div>
        </div>}

        {pageState === 'complete' && score && <div className="space-y-5">
          <div className="grid gap-5 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
            <div className="mx-auto grid h-36 w-36 place-items-center rounded-full p-2" role="img" aria-label={`Readiness score ${score.score} out of 100`} style={{ background: `conic-gradient(#1d4ed8 ${score.score}%, #dbeafe ${score.score}% 100%)` }}><div className="grid h-full w-full place-content-center rounded-full bg-white text-center shadow-inner"><span className="text-4xl font-black tracking-tight text-blue-950">{score.score}</span><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">out of 100</span></div></div>
            <div><div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-800"><ShieldCheck className="h-4 w-4" /> Advisory result</div><h3 className="mt-3 text-xl font-bold text-slate-950">{score.label}</h3><p className="mt-1 text-sm text-slate-600">{tenantName}{screeningPropertyTitle || selectedProperty?.title ? ` · ${screeningPropertyTitle || selectedProperty?.title}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-blue-900">{score.confidence} confidence</span><span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900">{score.evidence_coverage}% evidence coverage</span></div></div>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4"><h4 className="font-bold text-slate-900">What shaped this score</h4><p className="mt-1 text-xs text-slate-500">Each factor uses a 100-point scale and is weighted as shown.</p></div><div className="space-y-4">{score.factors.map((factor) => <div key={factor.key}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-800">{factor.label}<span className="ml-2 text-xs font-normal text-slate-500">{Math.round(factor.weight * 100)}% weight</span></span><span className="font-bold tabular-nums text-blue-900">{factor.score}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`${factor.label} factor score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={factor.score}><div className="h-full rounded-full bg-blue-700" style={{ width: `${factor.score}%` }} /></div></div>)}</div></section>
          {reportSources.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h4 className="font-bold text-slate-900">Information sources</h4><p className="mt-1 text-xs text-slate-500">This shows who supplied each item. Reported information and document availability are not independently verified by the score.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{reportSources.map(([key, source]) => <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="capitalize text-slate-600">{key.replaceAll('_', ' ')}</span><span className="text-right font-semibold text-slate-800">{{ landlord_reported: 'Landlord reported', tenant_reported: 'Tenant reported', landlord_supplied: 'Landlord supplied', not_provided: 'Not provided' }[source] || source.replaceAll('_', ' ')}</span></div>)}</div></section>}
          {providerCheckEntries.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-2"><h4 className="text-sm font-bold text-slate-900">Identity and credit checks</h4><p className="mt-1 text-xs text-slate-500">These provider results are separate from the readiness score.</p></div>{providerCheckEntries.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-t border-slate-100 py-3 text-xs capitalize"><span className="text-slate-700">{key.replaceAll('_', ' ')}</span><span className="font-semibold text-slate-900">{value.replaceAll('_', ' ')}</span></div>)}</div>}
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{score.disclaimer} Identity status is reported separately and is never included in the score.</span></div>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Start another screening</button>
        </div>}

        {history.length > 0 && <section className="border-t border-slate-100 pt-6"><h3 className="mb-3 text-sm font-bold text-slate-900">Recent screenings</h3><div className="space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"><div><div className="text-sm font-bold text-slate-900">{item.tenant_name}</div><div className="text-xs text-slate-500">{item.property_title} · {item.package_id} · {new Date(item.created_at).toLocaleDateString()}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold capitalize text-slate-800">{item.score?.score ? `${item.score.score}/100` : item.status.replaceAll('_', ' ')}</div><div className="text-[11px] capitalize text-slate-500">{item.payment_status} · {item.score?.confidence || 'score pending'}</div></div><button type="button" disabled={busy} onClick={() => void resumeScreening(item.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{item.status === 'complete' ? 'View' : 'Continue'}</button></div></div>)}</div></section>}
      </div>
    </section>
  );
}
