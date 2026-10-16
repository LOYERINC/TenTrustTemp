import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  credit_report?: { provider?: string; providers?: string[]; credit_history?: unknown[]; fetched_at?: string | null } | null;
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
type PageState = 'packages' | 'details' | 'confirming_payment' | 'paid' | 'processing' | 'complete' | 'link_ready';
const PENDING_PAYMENT_KEY = 'tentrust.pendingScreeningPayment';

function readPendingPayment(): { screeningId?: string; reference?: string } {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_PAYMENT_KEY) || '{}');
  } catch {
    return {};
  }
}

function clearPendingPayment() {
  try { window.sessionStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* Session storage can be unavailable in restricted browsers. */ }
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600';
const checkLabels: Record<string, string> = {
  readiness_score: 'Tenant score', identity: 'ID check', credit_bureau: 'Credit history check', '3_premium_checks': '3 Premium checks',
};

function readableCheckStatus(value: string) {
  const [rawStatus, ...detailParts] = value.split(':');
  const labels: Record<string, string> = {
    verified: 'Verified', complete: 'Complete', failed: 'Failed', incomplete: 'Incomplete', unavailable: 'Unavailable',
  };
  const status = labels[rawStatus.trim().toLowerCase()] || rawStatus.replaceAll('_', ' ');
  const detail = detailParts.join(':').trim();
  return detail ? `${status} — ${detail}` : status;
}

function confidenceLabel(value: string) {
  if (value === 'high') return 'Most details shared';
  if (value === 'moderate') return 'Some details missing';
  return 'More details needed';
}

function recommendationFor(score: ReadinessScore) {
  if (score.recommendation && score.recommendation_label) return { label: score.recommendation_label, detail: score.recommendation };
  if (score.confidence === 'low') return { label: 'More details needed', detail: 'There is not enough information for a strong result. Ask for more details before you decide.' };
  if (score.score >= 75) return { label: 'Good details', detail: 'The details look good. Still use the same checks and rules for each tenant.' };
  if (score.score >= 50) return { label: 'Review this report', detail: 'Check the income and rent history. Ask the tenant about any missing details.' };
  return { label: 'Review these details', detail: 'The rent or rent history may need a closer look. Review the details with the tenant.' };
}

export default function DashboardVerifyTenant({ properties }: DashboardVerifyTenantProps) {
  const paymentReturnInFlight = useRef(false);
  const paymentTimingStartedAt = useRef<number | null>(null);
  const paymentTimingReadyLogged = useRef(false);
  const [packages, setPackages] = useState<ScreeningPackage[]>([]);
  const [premiumCredits, setPremiumCredits] = useState(0);
  const [history, setHistory] = useState<ScreeningHistoryItem[]>([]);
  const [useBundleCredit, setUseBundleCredit] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('basic');
  const [mode, setMode] = useState<IntakeMode>('tenant_link');
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
  const [creditReport, setCreditReport] = useState<ScreeningHistoryItem['credit_report']>(null);
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
  const readyReports = history.filter((item) => item.status === 'complete' && item.score);
  const recommendation = score ? recommendationFor(score) : null;

  const validateScreeningInput = () => {
    const errors: Record<string, string> = {};
    if (tenantName.trim().length < 2) errors.tenant_name = 'Enter the tenant’s full name.';
    if (tenantPhone.trim().length < 6) errors.tenant_phone = 'Enter the tenant’s phone number.';
    if (tenantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail.trim())) {
      errors.tenant_email = 'Enter a valid email, or leave this blank.';
    }

    if (!Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) <= 0 || Number(monthlyRent) > 1_000_000_000) errors.monthly_rent = 'Enter the rent each month.';

    if (mode === 'direct') {
      if (!Number.isFinite(Number(monthlyIncome)) || Number(monthlyIncome) <= 0 || Number(monthlyIncome) > 1_000_000_000) errors.monthly_income = 'Enter an income amount above zero.';
      if (!consentConfirmed) errors.consent = 'Get the tenant’s consent before you continue.';

      const hasOnTime = onTimePayments.trim() !== '';
      const hasTotal = totalPayments.trim() !== '';
    if (hasOnTime !== hasTotal) {
        if (!hasOnTime) errors.on_time_payments = 'Enter both numbers, or leave both blank.';
        if (!hasTotal) errors.total_payments = 'Enter both numbers, or leave both blank.';
    } else if (hasOnTime && hasTotal) {
        const onTime = Number(onTimePayments);
        const total = Number(totalPayments);
        if (!Number.isInteger(onTime) || onTime < 0 || onTime > 12) errors.on_time_payments = 'Enter a whole number from 0 to 12.';
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
    const startedAt = performance.now();
    try {
      const result = await screeningApi<{ screenings: ScreeningHistoryItem[] }>('/api/screenings?limit=20');
      setHistory(result.screenings);
    } catch {
      setHistory([]);
    } finally {
      console.info(`[payment-timing] background history refresh elapsed_ms=${(performance.now() - startedAt).toFixed(1)}`);
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
    setCreditReport(record.credit_report || null);
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
          const result = await screeningApi<{ status: string; score: ReadinessScore; check_status: Record<string, string>; credit_report?: ScreeningHistoryItem['credit_report'] }>(
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
          setCreditReport(result.credit_report || null);
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

  const confirmPaymentReturn = async (returnedScreeningId: string, reference: string) => {
    if (paymentReturnInFlight.current) return;
    paymentReturnInFlight.current = true;
    paymentTimingStartedAt.current = performance.now();
    paymentTimingReadyLogged.current = false;
    console.info('[payment-timing] client payment return received');
    setScreeningId(returnedScreeningId);
    setPaymentReference(reference);
    setPageState('confirming_payment');
    setError('');
    setBusy(true);
    try {
      const verifyStartedAt = performance.now();
      const result = await screeningApi<{ status: string; tenant_url?: string; payment_status: string; screening_id: string; package_id?: string; tenant_name?: string; tenant_phone?: string; tenant_email?: string | null; property_title?: string }>(
        `/api/screenings/${encodeURIComponent(returnedScreeningId)}/verify-payment?reference=${encodeURIComponent(reference)}`,
        { method: 'POST' },
      );
      console.info(`[payment-timing] client server confirmation complete elapsed_ms=${(performance.now() - verifyStartedAt).toFixed(1)} link_returned=${Boolean(result.tenant_url)}`);
      if (result.payment_status !== 'paid') throw new Error('Payment has not been confirmed yet. Your screening is saved; retry the check in a moment.');
      if (result.tenant_url) {
        setSelectedPackageId(result.package_id || selectedPackageId);
        setTenantName(result.tenant_name || '');
        setTenantPhone(result.tenant_phone || '');
        setTenantEmail(result.tenant_email || '');
        setScreeningPropertyTitle(result.property_title || 'Rental application');
        setTenantLink(result.tenant_url);
        setPageState('link_ready');
        void refreshHistory();
      } else {
        await showPaidScreening(returnedScreeningId, reference);
      }
      clearPendingPayment();
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('screening');
      cleanUrl.searchParams.delete('reference');
      cleanUrl.searchParams.delete('tx_ref');
      window.history.replaceState({}, '', cleanUrl);
    } catch (requestError) {
      // Stay on the confirmation screen so a temporary provider/network error never looks like a fresh plan selection.
      setPageState('confirming_payment');
      setError(formatScreeningError(requestError));
      void refreshHistory();
    } finally {
      paymentReturnInFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (pageState !== 'link_ready' || !tenantLink || paymentTimingReadyLogged.current || paymentTimingStartedAt.current === null) return;
    paymentTimingReadyLogged.current = true;
    console.info(`[payment-timing] client share screen rendered total_ms=${(performance.now() - paymentTimingStartedAt.current).toFixed(1)}`);
  }, [pageState, tenantLink]);

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
    const reportId = query.get('report');
    const returnedScreeningId = query.get('screening');
    const reference = query.get('reference') || query.get('tx_ref');
    if (reportId) {
      setBusy(true);
      screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(reportId)}`)
        .then((record) => {
          if (record.status !== 'complete' || !record.score) throw new Error('This report is not ready yet. Open Recent screenings to check its status.');
          setScreeningId(record.id);
          setSelectedPackageId(record.package_id);
          setTenantName(record.tenant_name);
          setTenantPhone(record.tenant_phone);
          setTenantEmail(record.tenant_email || '');
          setScreeningPropertyTitle(record.property_title);
          setScore(record.score);
          setCheckStatus(record.check_status || {});
          setCreditReport(record.credit_report || null);
          setPageState('complete');
          void refreshHistory();
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('report');
          window.history.replaceState({}, '', cleanUrl);
        })
        .catch((requestError) => setError(formatScreeningError(requestError)))
        .finally(() => setBusy(false));
      return;
    }
    const pending = readPendingPayment();
    const screeningId = returnedScreeningId || pending.screeningId;
    const paymentReference = reference || pending.reference;
    if (!screeningId || !paymentReference) return;
    void confirmPaymentReturn(screeningId, paymentReference);
  }, []);

  useEffect(() => {
    if (pageState !== 'link_ready' || !screeningId) return;
    let active = true;
    const checkForReport = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const record = await screeningApi<ScreeningHistoryItem>(`/api/screenings/${encodeURIComponent(screeningId)}`);
        if (!active || record.status !== 'complete' || !record.score) return;
        setScore(record.score);
        setCheckStatus(record.check_status || {});
        setCreditReport(record.credit_report || null);
        setTenantName(record.tenant_name);
        setScreeningPropertyTitle(record.property_title);
        setPageState('complete');
        void refreshHistory();
      } catch {
        // Keep the private link available; the manual status check can show a recoverable error.
      }
    };
    void checkForReport();
    const timer = window.setInterval(() => void checkForReport(), 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pageState, screeningId]);

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
          monthly_rent: Number(monthlyRent),
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
      try { window.sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ screeningId: created.screening_id, reference: checkout.reference })); } catch { /* The payment provider also returns these values in its callback URL. */ }
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
      const result = await screeningApi<{ status: string; score: ReadinessScore; check_status: Record<string, string>; credit_report?: ScreeningHistoryItem['credit_report'] }>(
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
      setCreditReport(result.credit_report || null);
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
      setCreditReport(record.credit_report || null);
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
      setCreditReport(record.credit_report || null);
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
    clearPendingPayment();
    setPageState('packages');
    setTenantName(''); setTenantPhone(''); setTenantEmail(''); setMonthlyRent(selectedProperty?.rentAmount ? String(selectedProperty.rentAmount / 12) : ''); setMonthlyIncome(''); setOnTimePayments(''); setTotalPayments('');
    setIncomeEvidence(false); setRentalReference(false); setConsentConfirmed(false); setProcessingConsent(false); setBvn('');
    setScreeningId(''); setPaymentReference(''); setTenantLink(''); setScore(null); setCheckStatus({}); setCreditReport(null); setFieldErrors({}); setScreeningStatusMessage(''); setUseBundleCredit(false); setScreeningPropertyTitle(''); setError('');
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="brand-banner-art px-6 py-7 text-white md:px-9">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"><ShieldCheck className="h-4 w-4" /> Tenant check</div>
        <h2 className="text-2xl font-extrabold md:text-3xl">{pageState === 'complete' ? 'Tenant report' : pageState === 'link_ready' ? 'Tenant link is ready' : pageState === 'confirming_payment' ? 'Checking your payment' : pageState === 'paid' || pageState === 'processing' ? 'Your report is on the way' : 'Pick a plan'}</h2>
        <p className="mt-2 max-w-2xl text-sm text-blue-100">{pageState === 'complete' ? 'See the score and check results.' : pageState === 'link_ready' ? 'Send this link to your tenant. The report will show here when they finish.' : pageState === 'confirming_payment' ? 'We are checking your payment.' : pageState === 'paid' || pageState === 'processing' ? 'We will show the report when the checks are done.' : 'Pick a plan, add the tenant, pay, and get a report.'}</p>
      </div>

      <div className="space-y-7 p-5 md:p-9">
        {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><XCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}

        {pageState === 'packages' && <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">1. Pick a plan</h3><p className="mt-1 text-xs text-slate-500">These prices may change before launch.</p></div>
            <span className="font-label rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-900">STEP 1 OF 3</span>
          </div>
          {!packages.length && !error && <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading available packages…</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {packages.map((pkg) => <button key={pkg.id} type="button" disabled={!pkg.enabled || busy} onClick={() => { setSelectedPackageId(pkg.id); if (pkg.checks.includes('credit_bureau') || pkg.checks.includes('3_premium_checks')) setMode('tenant_link'); }} className={`rounded-2xl border p-4 text-left transition ${pkg.id === selectedPackageId ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'} ${!pkg.enabled ? 'cursor-not-allowed opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-bold text-slate-900">{pkg.name}</div><p className="mt-1 text-xs leading-5 text-slate-600">{pkg.description}</p></div><div className="whitespace-nowrap text-sm font-black text-blue-800">₦{pkg.price.toLocaleString()}</div></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{pkg.checks.map((check) => <span key={check} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{checkLabels[check] || check.replaceAll('_', ' ')}</span>)}</div>
              {!pkg.enabled && <p className="mt-3 text-xs font-semibold text-amber-800">Not ready: {pkg.unavailable_reason}</p>}
            </button>)}
          </div>
          <button type="button" disabled={!selectedPackage?.enabled} onClick={() => { setError(''); setPageState('details'); }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
        </div>}

        {pageState === 'details' && <form noValidate onSubmit={beginCheckout} className="space-y-6">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">2. Add tenant details</h3><p className="mt-1 text-xs text-slate-500">{selectedPackage?.name} · ₦{selectedPackage?.price.toLocaleString()}</p></div><button type="button" onClick={() => setPageState('packages')} className="text-xs font-semibold text-blue-700 hover:underline">Change plan</button></div>

          <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Who will add the tenant details?</legend><div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setMode('direct')} className={`rounded-2xl border p-4 text-left ${mode === 'direct' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><div className="flex items-center gap-2 font-bold text-slate-900"><User className="h-4 w-4" /> I will add details</div><p className="mt-1 text-xs leading-5 text-slate-600">Use this if the tenant has said yes. You add their pay, rent, and BVN.</p></button>
            <button type="button" onClick={() => setMode('tenant_link')} className={`rounded-2xl border p-4 text-left ${mode === 'tenant_link' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}><div className="flex items-center gap-2 font-bold text-slate-900"><UserRoundPlus className="h-4 w-4" /> Tenant fills in a link</div><p className="mt-1 text-xs leading-5 text-slate-600">After you pay, send a private link. The tenant adds pay, BVN, and consent.</p></button>
          </div></fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="tenant-name" className={labelClass}>Tenant name *</label><input id="tenant-name" required minLength={2} maxLength={160} aria-invalid={Boolean(fieldErrors.tenant_name)} aria-describedby={fieldErrors.tenant_name ? 'tenant-name-error' : undefined} value={tenantName} onChange={(event) => { setTenantName(event.target.value); clearFieldError('tenant_name'); }} className={`${inputClass} ${fieldErrors.tenant_name ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="name" />{fieldErrors.tenant_name && <p id="tenant-name-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_name}</p>}</div>
            <div><label htmlFor="tenant-phone" className={labelClass}>Tenant phone *</label><input id="tenant-phone" required minLength={6} maxLength={40} aria-invalid={Boolean(fieldErrors.tenant_phone)} aria-describedby={fieldErrors.tenant_phone ? 'tenant-phone-error' : undefined} value={tenantPhone} onChange={(event) => { setTenantPhone(event.target.value); clearFieldError('tenant_phone'); }} className={`${inputClass} ${fieldErrors.tenant_phone ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="tel" />{fieldErrors.tenant_phone && <p id="tenant-phone-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_phone}</p>}</div>
            <div><label htmlFor="tenant-email" className={labelClass}>Tenant email (optional)</label><input id="tenant-email" type="email" maxLength={200} aria-invalid={Boolean(fieldErrors.tenant_email)} aria-describedby={fieldErrors.tenant_email ? 'tenant-email-error' : undefined} value={tenantEmail} onChange={(event) => { setTenantEmail(event.target.value); clearFieldError('tenant_email'); }} className={`${inputClass} ${fieldErrors.tenant_email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} autoComplete="email" />{fieldErrors.tenant_email && <p id="tenant-email-error" className="mt-1 text-xs text-rose-700">{fieldErrors.tenant_email}</p>}</div>
            <div><label className={labelClass}>Home</label><select value={propertyId} onChange={(event) => { const value = event.target.value; setPropertyId(value); const property = properties.find((item) => item.id === value); if (property?.rentAmount) setMonthlyRent(String(property.rentAmount / 12)); }} className={inputClass}><option value="">Other home</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></div>
          </div>

          <div className="max-w-md"><label htmlFor="monthly-rent" className={labelClass}>Rent each month (₦) *</label><input id="monthly-rent" required min="0.01" max="1000000000" step="any" type="number" aria-invalid={Boolean(fieldErrors.monthly_rent)} aria-describedby={fieldErrors.monthly_rent ? 'monthly-rent-error' : 'monthly-rent-help'} value={monthlyRent} onChange={(event) => { setMonthlyRent(event.target.value); clearFieldError('monthly_rent'); }} className={`${inputClass} ${fieldErrors.monthly_rent ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{fieldErrors.monthly_rent ? <p id="monthly-rent-error" className="mt-1 text-xs text-rose-700">{fieldErrors.monthly_rent}</p> : <p id="monthly-rent-help" className="mt-1 text-xs text-slate-500">You enter the rent. The tenant enters their pay. We use both for the score.</p>}</div>

          {mode === 'direct' && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="monthly-income" className={labelClass}>Tenant pay each month (₦) *</label><input id="monthly-income" required min="0.01" max="1000000000" step="any" type="number" aria-invalid={Boolean(fieldErrors.monthly_income)} aria-describedby={fieldErrors.monthly_income ? 'monthly-income-error' : undefined} value={monthlyIncome} onChange={(event) => { setMonthlyIncome(event.target.value); clearFieldError('monthly_income'); }} className={`${inputClass} ${fieldErrors.monthly_income ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{fieldErrors.monthly_income && <p id="monthly-income-error" className="mt-1 text-xs text-rose-700">{fieldErrors.monthly_income}</p>}</div>
              <div><label htmlFor="on-time-payments" className={labelClass}>Rent paid on time (last 12 months)</label><input id="on-time-payments" min="0" max="12" step="1" type="number" aria-invalid={Boolean(fieldErrors.on_time_payments)} aria-describedby={fieldErrors.on_time_payments ? 'on-time-payments-error' : undefined} value={onTimePayments} onChange={(event) => { setOnTimePayments(event.target.value); clearFieldError('on_time_payments'); }} className={`${inputClass} ${fieldErrors.on_time_payments ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} placeholder="Leave both blank if you do not know" />{fieldErrors.on_time_payments && <p id="on-time-payments-error" className="mt-1 text-xs text-rose-700">{fieldErrors.on_time_payments}</p>}</div>
              <div><label htmlFor="total-payments" className={labelClass}>Rent payments checked (last 12 months)</label><input id="total-payments" min="0" max="12" step="1" type="number" aria-invalid={Boolean(fieldErrors.total_payments)} aria-describedby={fieldErrors.total_payments ? 'total-payments-error' : undefined} value={totalPayments} onChange={(event) => { setTotalPayments(event.target.value); clearFieldError('total_payments'); }} className={`${inputClass} ${fieldErrors.total_payments ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} placeholder="For example, 12" />{fieldErrors.total_payments && <p id="total-payments-error" className="mt-1 text-xs text-rose-700">{fieldErrors.total_payments}</p>}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={incomeEvidence} onChange={(event) => setIncomeEvidence(event.target.checked)} className="mt-0.5 accent-blue-700" />Proof of income is ready</label><label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={rentalReference} onChange={(event) => setRentalReference(event.target.checked)} className="mt-0.5 accent-blue-700" />A past landlord can give a reference</label></div>
            <div><label className={`flex items-start gap-3 rounded-2xl border p-4 text-xs leading-5 ${fieldErrors.consent ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><input id="tenant-consent" required type="checkbox" aria-invalid={Boolean(fieldErrors.consent)} aria-describedby={fieldErrors.consent ? 'tenant-consent-error' : undefined} checked={consentConfirmed} onChange={(event) => { setConsentConfirmed(event.target.checked); clearFieldError('consent'); }} className="mt-1 accent-amber-700" /><span>I confirm the tenant said yes to this check. I have not shared their details without consent.</span></label>{fieldErrors.consent && <p id="tenant-consent-error" className="mt-1 text-xs text-rose-700">{fieldErrors.consent}</p>}</div>
          </>}

          {mode === 'tenant_link' && <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />After you pay, the tenant gets a private link. They add their income and give consent there. You add the rent above.</div>}

          {selectedPackage?.id === 'premium' && premiumCredits > 0 && <label className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><input type="checkbox" checked={useBundleCredit} onChange={(event) => setUseBundleCredit(event.target.checked)} className="accent-emerald-700" /><span>Use one of your <strong>{premiumCredits}</strong> Founding Member Premium credits instead of paying again.</span></label>}

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={() => setPageState('packages')} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Back</button><button type="submit" disabled={busy || !selectedPackage?.enabled} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"><CreditCard className="h-4 w-4" />{busy ? 'Starting secure checkout…' : `Pay ₦${selectedPackage?.price.toLocaleString()} and continue`}</button></div>
        </form>}

        {pageState === 'paid' && <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-bold">Payment confirmed</div><div className="mt-1 text-xs">{tenantName} · {screeningPropertyTitle || selectedProperty?.title || 'Rental application'} · reference {paymentReference}</div></div></div>
          <form onSubmit={completeDirectScreening} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div><h3 className="font-bold text-slate-900">{needsProviderCheck ? 'Add the tenant’s BVN' : 'Finish the report'}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{needsProviderCheck ? 'The BVN is sent to the check service. It is not saved in the report. The score and check results are shown separately.' : 'Your payment and consent are saved. Try again to finish the report. You will not pay again.'}</p></div>
            {needsProviderCheck && <div><label htmlFor="paid-tenant-bvn" className={labelClass}>Tenant BVN *</label><input id="paid-tenant-bvn" required inputMode="numeric" pattern="[0-9]{11}" maxLength={11} value={bvn} onChange={(event) => setBvn(event.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="11 digits" /><p className="mt-1 text-[11px] text-slate-500">Only enter this after the tenant has consented to the included provider check.</p></div>}
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={processingConsent} onChange={(event) => setProcessingConsent(event.target.checked)} className="mt-0.5 accent-blue-700" />I confirm the tenant said yes to these checks and the details are right.</label>
            <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{busy ? 'Making the report…' : needsProviderCheck ? 'Run checks and make report' : 'Try again'}</button>
          </form>
          {providerCheckEntries.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h4 className="text-sm font-bold text-amber-950">Check status</h4><p className="mt-1 text-xs text-amber-900">The report is ready when all checks are done. A failed check will not show as passed.</p>{providerCheckEntries.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-t border-amber-200 py-2 text-xs capitalize text-amber-950"><span>{key.replaceAll('_', ' ')}</span><span className="text-right font-semibold">{value.replaceAll('_', ' ')}</span></div>)}</div>}
        </div>}

        {pageState === 'confirming_payment' && <div aria-live="polite" className="space-y-5 rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><CreditCard className="h-6 w-6" /></div><div><h3 className="font-bold text-slate-950">{busy ? 'Checking your payment' : 'Payment confirmation is taking longer than expected'}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{busy ? 'Please keep this page open. We’re checking the transaction with the payment provider before continuing.' : 'Your screening is saved. Check again in a moment; you won’t be charged again by retrying this confirmation.'}</p></div>{busy && <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-blue-700" />}<div className="flex flex-wrap justify-center gap-3"><button type="button" disabled={busy || !screeningId || !paymentReference} onClick={() => void confirmPaymentReturn(screeningId, paymentReference)} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Check payment again</button><button type="button" disabled={busy} onClick={() => { reset(); const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete('screening'); cleanUrl.searchParams.delete('reference'); cleanUrl.searchParams.delete('tx_ref'); window.history.replaceState({}, '', cleanUrl); }} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Return to plans</button></div></div>}

        {pageState === 'processing' && <div aria-live="polite" className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 py-8 text-center"><div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />Payment successful</div><LoaderCircle className="mt-2 h-9 w-9 animate-spin text-blue-700" /><p className="font-bold text-slate-900">Preparing your screening report</p><p className="max-w-md text-sm text-slate-600">Your payment is confirmed. We’re calculating the report now. Keep this page open; this can take a few moments.</p></div>}

        {pageState === 'link_ready' && <div className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3 text-emerald-900"><CheckCircle2 className="h-6 w-6" /><div><h3 className="font-bold">Paid · tenant link ready</h3><p className="text-xs">The link works once and expires in 48 hours.</p></div></div>
          <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-3 text-xs leading-5 text-blue-900"><LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /><span>We are waiting for the tenant. This page checks for their details and opens the report when it is ready. Email alerts work when email is set up.</span></div>
          <div className="flex flex-col gap-2 sm:flex-row"><input readOnly value={tenantLink} className={`${inputClass} font-mono text-xs`} /><button type="button" onClick={copyTenantLink} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">{copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}</button></div>
          {screeningStatusMessage && <p role="status" className="rounded-xl border border-blue-100 bg-white p-3 text-xs leading-5 text-blue-900">{screeningStatusMessage}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <a href={`https://wa.me/${tenantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Please complete your TenTrust tenant screening using this secure link: ${tenantLink}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white"><LinkIcon className="h-4 w-4" />Send by WhatsApp</a>
            {tenantEmail && <a href={`mailto:${encodeURIComponent(tenantEmail)}?subject=${encodeURIComponent('Complete your TenTrust tenant screening')}&body=${encodeURIComponent(`Please complete your TenTrust tenant screening using this private link: ${tenantLink}`)}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700">Email tenant</a>}
            <a href={tenantLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700"><ExternalLink className="h-4 w-4" />View tenant form</a><button type="button" disabled={busy} onClick={() => void checkTenantSubmission()} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-bold text-blue-800 disabled:opacity-50">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Check for report</button><button type="button" onClick={reset} className="ml-auto text-xs font-semibold text-slate-600 hover:underline">Start a new check</button>
          </div>
        </div>}

        {pageState === 'complete' && score && <div className="space-y-5">
          <div className="grid gap-5 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
            <div className="mx-auto grid h-36 w-36 place-items-center rounded-full p-2" role="img" aria-label={`Readiness score ${score.score} out of 100`} style={{ background: `conic-gradient(var(--blue-700) ${score.score}%, var(--blue-100) ${score.score}% 100%)` }}><div className="grid h-full w-full place-content-center rounded-full bg-white text-center shadow-inner"><span className="text-4xl font-black tracking-tight text-blue-950">{score.score}</span><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">out of 100</span></div></div>
            <div><div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-800"><ShieldCheck className="h-4 w-4" /> Score to help you review</div><h3 className="mt-3 text-xl font-bold text-slate-950">{score.label}</h3><p className="mt-1 text-sm text-slate-600">{tenantName}{screeningPropertyTitle || selectedProperty?.title ? ` · ${screeningPropertyTitle || selectedProperty?.title}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900">{confidenceLabel(score.confidence)}</span><span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900">{score.evidence_coverage}% of details shared</span></div></div>
          </div>
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><div className="flex items-center gap-2 text-blue-950"><BadgeCheck className="h-5 w-5" /><h4 className="font-bold">{recommendation?.label}</h4></div><p className="mt-2 text-sm leading-6 text-blue-950">{recommendation?.detail}</p><p className="mt-2 text-xs leading-5 text-blue-800">This is decision support, not an automatic approval or rejection. Apply the same rental criteria consistently to every applicant.</p></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4"><h4 className="font-bold text-slate-900">How we got this score</h4><p className="mt-1 text-xs text-slate-500">Each part has a score out of 100. The percent shows how much it counts.</p></div><div className="space-y-4">{score.factors.map((factor) => <div key={factor.key}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-800">{factor.label}<span className="ml-2 text-xs font-normal text-slate-500">{Math.round(factor.weight * 100)}% of score</span></span><span className="font-bold tabular-nums text-blue-900">{factor.score}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={`${factor.label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={factor.score}><div className="h-full rounded-full bg-blue-700" style={{ width: `${factor.score}%` }} /></div></div>)}</div></section>
          {reportSources.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h4 className="font-bold text-slate-900">Who gave us these details</h4><p className="mt-1 text-xs text-slate-500">This shows who shared each detail. The score does not check these details or papers.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{reportSources.map(([key, source]) => <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="capitalize text-slate-600">{key.replaceAll('_', ' ')}</span><span className="text-right font-semibold text-slate-800">{{ landlord_reported: 'Landlord gave this', tenant_reported: 'Tenant gave this', landlord_supplied: 'Landlord gave this', not_provided: 'Not shared' }[source] || source.replaceAll('_', ' ')}</span></div>)}</div></section>}
          {providerCheckEntries.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-2"><h4 className="text-sm font-bold text-slate-900">ID and credit checks</h4><p className="mt-1 text-xs text-slate-500">These checks do not change the tenant score.</p></div>{providerCheckEntries.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-t border-slate-100 py-3 text-xs capitalize"><span className="text-slate-700">{key.replaceAll('_', ' ')}</span><span className="text-right font-semibold text-slate-900">{readableCheckStatus(value)}</span></div>)}</div>}
          {creditReport && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h4 className="font-bold text-slate-900">Mono credit report</h4><p className="mt-1 text-xs text-slate-500">This is the credit data Mono sent back. Your BVN, date of birth, address, and contact details are not shown.</p><pre className="mt-3 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-emerald-100">{JSON.stringify(creditReport, null, 2)}</pre></section>}
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{score.disclaimer} Identity status is reported separately and is never included in the score.</span></div>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Start another screening</button>
        </div>}

        {history.length > 0 && <section className="border-t border-slate-100 pt-6">
          {readyReports.length > 0 && <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div className="min-w-0 flex-1"><h3 className="font-bold text-emerald-950">{readyReports.length === 1 ? 'A screening report is ready' : `${readyReports.length} screening reports are ready`}</h3><p className="mt-1 text-xs leading-5 text-emerald-900">Open a report to review the score, supporting information, and provider-check status.</p><div className="mt-3 flex flex-wrap gap-2">{readyReports.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void resumeScreening(item.id)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">View {item.tenant_name}’s report</button>)}</div></div></div></div>}
          <h3 className="mb-3 text-sm font-bold text-slate-900">Recent screenings</h3><div className="space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"><div><div className="text-sm font-bold text-slate-900">{item.tenant_name}</div><div className="text-xs text-slate-500">{item.property_title} · {item.package_id} · {new Date(item.created_at).toLocaleDateString()}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold capitalize text-slate-800">{item.score?.score ? `${item.score.score}/100` : item.status.replaceAll('_', ' ')}</div><div className="text-[11px] capitalize text-slate-500">{item.status === 'complete' ? 'report ready' : `${item.payment_status} · ${item.score?.confidence || 'score pending'}`}</div></div><button type="button" disabled={busy} onClick={() => void resumeScreening(item.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{item.status === 'complete' ? 'View report' : 'Continue'}</button></div></div>)}</div></section>}
      </div>
    </section>
  );
}
