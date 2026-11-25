import { FormEvent, useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  UploadCloud,
  FileText,
  User,
  Briefcase,
  MapPin,
  Users,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Eye,
  EyeSlash,
  BadgeCheck,
  Sparkles,
} from '../lib/icons';
import { Brand, Button, Card, Toast } from '../components/mvp-ui';
import CompleteCheckTenant from './CompleteCheckTenant';
import { formatScreeningError, screeningApi } from '../lib/screeningApi';
import {
  getVerificationPolicy,
  submitConsent,
  submitIdentity,
  sendIdentityOtp,
  verifyIdentityOtp,
  submitLiveness,
  submitEmployment,
  submitAddress,
  submitReference,
  inviteGuarantor,
  getCaseSummary,
  submitDispute,
  revokeConsent,
  fileToBase64,
  formatVerificationError,
  VerificationPolicy,
  Purpose,
  LandlordSummary,
} from '../lib/verificationApi';

interface PublicRequest {
  identity_provider?: 'interswitch' | null;
  tenant_name: string;
  property_title: string;
  landlord_name: string;
  package?: {
    name: string;
    checks: string[];
  };
}

type Step = 'consent' | 'identity' | 'otp' | 'selfie' | 'employment' | 'address' | 'references' | 'summary';

const ALL_PURPOSES: Purpose[] = [
  'identity',
  'liveness',
  'employment',
  'address',
  'references',
  'guarantor',
  'summary_sharing',
];

export default function TenantVerificationPortal() {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const caseIdFromQuery = searchParams.get('case') || '';

  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [policy, setPolicy] = useState<VerificationPolicy | null>(null);
  const [activeStep, setActiveStep] = useState<Step>('consent');
  const [caseId, setCaseId] = useState<string>(caseIdFromQuery);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Step 1: Consent state
  const [selectedPurposes, setSelectedPurposes] = useState<Purpose[]>(ALL_PURPOSES);

  // Step 2: Identity & OTP state
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [dob, setDob] = useState('');
  const [showBvn, setShowBvn] = useState(false);
  const [showNin, setShowNin] = useState(false);
  const [allowedMethods, setAllowedMethods] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'phone' | 'phone_1' | 'email' | 'alternate_phone'>('phone');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);

  // Step 3: Selfie state
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>('');
  const [selfieAttempts, setSelfieAttempts] = useState(0);
  const [selfieDone, setSelfieDone] = useState(false);

  // Step 4: Employment state
  const [employerName, setEmployerName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState<'employed' | 'self_employed'>('employed');
  const [monthlyIncomeNaira, setMonthlyIncomeNaira] = useState('');
  const [employmentDoc, setEmploymentDoc] = useState<File | null>(null);
  const [cacNumber, setCacNumber] = useState('');
  const [employmentDone, setEmploymentDone] = useState(false);

  // Step 5: Address state
  const [addressText, setAddressText] = useState('');
  const [proofType, setProofType] = useState<'utility_bill' | 'tenancy_agreement' | 'other'>('utility_bill');
  const [addressDoc, setAddressDoc] = useState<File | null>(null);
  const [addressDone, setAddressDone] = useState(false);

  // Step 6: References & Guarantor state
  const [refType, setRefType] = useState<'previous_landlord' | 'personal' | 'professional'>('previous_landlord');
  const [refName, setRefName] = useState('');
  const [refPhone, setRefPhone] = useState('');
  const [refEmail, setRefEmail] = useState('');
  const [refSubmitted, setRefSubmitted] = useState<string[]>([]);

  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorEmail, setGuarantorEmail] = useState('');
  const [guarantorRel, setGuarantorRel] = useState('');
  const [guarantorInviteCode, setGuarantorInviteCode] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Step 7: Summary state
  const [summary, setSummary] = useState<LandlordSummary | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [consentRevoked, setConsentRevoked] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setLoading(true);
      setError('');
      try {
        const pol = await getVerificationPolicy().catch(() => ({
          version: '2026-10-25',
          retention_days: 30,
          identity: 'Separate BVN OTP and NIN lookups with Mono.',
          liveness: 'Reviewer compares selfie to verified photo.',
          credit_status: 'not_available',
          decision: 'Human review required; evidence completeness is not a rental eligibility score.',
        }));
        if (active) setPolicy(pol);

        if (token) {
          try {
            const req = await screeningApi<PublicRequest>(
              `/api/public/screenings/${encodeURIComponent(token)}`,
              {},
              false
            );
            if (active) setRequest(req);
          } catch (e) {
            // If token fails or is not a legacy screening token, check if token is a case UUID
            if (/^[0-9a-f-]{36}$/i.test(token)) {
              if (active) setCaseId(token);
            } else {
              if (active) setError(formatScreeningError(e));
            }
          }
        }
      } catch (err) {
        if (active) setError(formatVerificationError(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, [token]);

  // If caseId is present, attempt to fetch summary
  useEffect(() => {
    if (!caseId) return;
    getCaseSummary(caseId)
      .then(res => setSummary(res))
      .catch(() => {});
  }, [caseId, activeStep]);

  // Consent submission handler
  const handleConsentSubmit = async () => {
    if (selectedPurposes.length === 0) {
      setError('Please select at least one verification purpose to continue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (token && !caseId) {
        // Fallback for legacy token screening
        await screeningApi(
          `/api/public/screenings/${encodeURIComponent(token)}/consent`,
          { method: 'POST', body: JSON.stringify({ consent: true }) },
          false
        );
      } else if (caseId) {
        await submitConsent(caseId, {
          granted: true,
          purposes: selectedPurposes,
          policy_version: policy?.version || '2026-10-25',
        });
      }
      setActiveStep('identity');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Identity submission handler
  const handleIdentitySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{11}$/.test(bvn) || !/^\d{11}$/.test(nin)) {
      setError('Enter both your 11-digit BVN and 11-digit NIN.');
      return;
    }
    if (!dob) {
      setError('Please select your date of birth as shown on your government ID.');
      return;
    }
    setBusy(true);
    try {
      if (token && !caseId) {
        // Legacy screening identity endpoint
        const response = await screeningApi<{ name_match: string }>(
          `/api/public/screenings/${encodeURIComponent(token)}/identity`,
          {
            method: 'POST',
            body: JSON.stringify({
              document_type: 'bvn',
              document_number: bvn,
              bvn,
              nin,
              date_of_birth: dob || undefined,
            }),
          },
          false
        );
        setIdentityVerified(true);
        setActiveStep('selfie');
      } else if (caseId) {
        // v1 Verification API: starts BVN OTP flow
        const methodsRes = await submitIdentity(caseId, {
          bvn,
          nin,
          date_of_birth: dob || undefined,
        });
        const methods = methodsRes.methods || ['phone'];
        setAllowedMethods(methods);
        setSelectedMethod((methods[0] as any) || 'phone');
        setActiveStep('otp');
      } else {
        // Tenant without a preset caseId
        setIdentityVerified(true);
        setActiveStep('selfie');
      }
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Send OTP
  const handleSendOtp = async () => {
    if (!caseId) return;
    setBusy(true);
    setError('');
    try {
      await sendIdentityOtp(caseId, {
        method: selectedMethod,
        phone_number: selectedMethod === 'alternate_phone' ? alternatePhone : undefined,
      });
      setOtpSent(true);
      setSuccessNotice(`OTP has been sent to your selected delivery method.`);
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    if (otpCode.length < 4) {
      setError('Please enter the verification code sent to you.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyIdentityOtp(caseId, { otp: otpCode });
      setIdentityVerified(true);
      setActiveStep('selfie');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Selfie selection & upload
  const handleSelfieSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG or PNG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Selfie must be under 5 MB.');
      return;
    }
    setSelfieFile(file);
    const reader = new FileReader();
    reader.onload = () => setSelfiePreview(reader.result as string);
    reader.readAsDataURL(file);
    setError('');
  };

  const handleSelfieSubmit = async () => {
    if (!selfieFile) {
      setError('Please take or upload a selfie first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (caseId) {
        const encoded = await fileToBase64(selfieFile);
        await submitLiveness(caseId, {
          selfie: {
            content_base64: encoded.base64,
            content_type: encoded.contentType,
          },
        });
      }
      setSelfieDone(true);
      setSelfieAttempts(prev => prev + 1);
      setActiveStep('employment');
    } catch (err) {
      setSelfieAttempts(prev => prev + 1);
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Employment submission
  const handleEmploymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!employerName.trim() || !jobTitle.trim() || !monthlyIncomeNaira) {
      setError('Please complete all employment fields.');
      return;
    }
    if (!employmentDoc) {
      setError('Please upload a proof of employment document (payslip or offer letter).');
      return;
    }
    const nairaNum = parseInt(monthlyIncomeNaira.replace(/\D/g, ''), 10);
    if (isNaN(nairaNum) || nairaNum <= 0) {
      setError('Please enter a valid monthly income.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (caseId) {
        const encoded = await fileToBase64(employmentDoc);
        await submitEmployment(caseId, {
          employer_name: employerName.trim(),
          job_title: jobTitle.trim(),
          employment_type: employmentType,
          monthly_income_kobo: nairaNum * 100,
          document: {
            content_base64: encoded.base64,
            content_type: encoded.contentType,
          },
          cac_number: employmentType === 'self_employed' && cacNumber ? cacNumber.trim() : null,
        });
      }
      setEmploymentDone(true);
      setActiveStep('address');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Address submission
  const handleAddressSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (addressText.trim().length < 8) {
      setError('Please enter your full residential address (at least 8 characters).');
      return;
    }
    if (!addressDoc) {
      setError('Please upload a document as proof of residential address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (caseId) {
        const encoded = await fileToBase64(addressDoc);
        await submitAddress(caseId, {
          address_text: addressText.trim(),
          proof_type: proofType,
          proof: {
            content_base64: encoded.base64,
            content_type: encoded.contentType,
          },
        });
      }
      setAddressDone(true);
      setActiveStep('references');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Add reference contact
  const handleAddReference = async (e: FormEvent) => {
    e.preventDefault();
    if (!refName.trim() || !refPhone.trim()) {
      setError('Please provide the reference name and phone number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (caseId) {
        await submitReference(caseId, {
          type: refType,
          name: refName.trim(),
          phone: refPhone.trim(),
          email: refEmail.trim() || null,
        });
      }
      setRefSubmitted(prev => [...prev, `${refName.trim()} (${refType.replace('_', ' ')})`]);
      setRefName('');
      setRefPhone('');
      setRefEmail('');
      setSuccessNotice('Reference contact added.');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Invite guarantor
  const handleInviteGuarantor = async (e: FormEvent) => {
    e.preventDefault();
    if (!guarantorName.trim() || !guarantorPhone.trim() || !guarantorEmail.trim()) {
      setError('Please fill in the guarantor details.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (caseId) {
        const res = await inviteGuarantor(caseId, {
          full_name: guarantorName.trim(),
          phone: guarantorPhone.trim(),
          email: guarantorEmail.trim(),
          relationship: guarantorRel.trim() || 'Guarantor',
        });
        setGuarantorInviteCode(res.invitation);
        setSuccessNotice('Guarantor invitation created successfully.');
      } else {
        setGuarantorInviteCode('TEN-GT-' + Math.random().toString(36).substring(2, 10).toUpperCase());
      }
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Dispute submission
  const handleDispute = async (e: FormEvent) => {
    e.preventDefault();
    if (!caseId || disputeReason.trim().length < 10) {
      setError('Please provide a reason with at least 10 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitDispute(caseId, disputeReason.trim());
      setSuccessNotice('Your dispute has been logged and forwarded for manual human review.');
      setDisputeOpen(false);
      setDisputeReason('');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  // Revoke consent
  const handleRevokeConsent = async () => {
    if (!caseId) return;
    if (!window.confirm('Are you sure you want to revoke your consent? This will immediately expire your verification case and schedule sensitive records for deletion.')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await revokeConsent(caseId, 'tenant');
      setConsentRevoked(true);
      setSuccessNotice('Your consent has been revoked and verification case marked as expired.');
    } catch (err) {
      setError(formatVerificationError(err));
    } finally {
      setBusy(false);
    }
  };

  const [isMockMode, setIsMockMode] = useState(false);

  const skipToMockReview = () => {
    setIsMockMode(true);
    setConsentRevoked(false);
    setSelectedPurposes(ALL_PURPOSES);
    setBvn('22234567891');
    setNin('10293847561');
    setDob('1994-06-18');
    setIdentityVerified(true);
    setSelfiePreview('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80');
    setSelfieDone(true);
    setSelfieAttempts(1);
    setEmployerName('Paystack Payments Limited');
    setJobTitle('Senior Product Designer');
    setEmploymentType('employed');
    setMonthlyIncomeNaira('950,000');
    setEmploymentDone(true);
    setAddressText('Flat 4B, Ocean View Terraces, Lekki Phase 1, Lagos');
    setProofType('utility_bill');
    setAddressDone(true);
    setRefSubmitted([
      'Chief Babatunde Adeleke (Previous Landlord)',
      'Sarah Johnson (Head of Product, Paystack)',
    ]);
    setGuarantorName('Dr. Olumide Adeleke');
    setGuarantorRel('Brother / Consultant Physician');
    setGuarantorInviteCode('GT-DEMO-9481-VERIFIED');
    setSummary({
      caseId: caseId || '8f94bd23-2ef5-47b6-b864-5fa7dc237eae',
      tenantFirstName: request?.tenant_name?.split(' ')[0] || 'Oluwaseun',
      overallResult: 'pass',
      checks: [
        { name: 'Identity (BVN & NIN)', status: 'verified' },
        { name: 'Selfie Liveness', status: 'passed' },
        { name: 'Employment & Income', status: 'verified' },
        { name: 'Affordability Assessment', status: 'passed' },
        { name: 'Residential Address', status: 'verified' },
        { name: 'Guarantor & References', status: 'verified' },
      ],
      reasons: [
        'All identification, employment affordability, and residential background requirements met.',
        'Declared rent-to-income calculated at 28.4% (well within the 40% maximum threshold).',
      ],
      verifiedAt: new Date().toISOString(),
    });
    setError('');
    setSuccessNotice('Fast-forward: All verification screens skipped with mock verified review data.');
    setActiveStep('summary');
  };

  const resetDemo = () => {
    setIsMockMode(false);
    setActiveStep('consent');
    setIdentityVerified(false);
    setSelfieDone(false);
    setEmploymentDone(false);
    setAddressDone(false);
    setBvn('');
    setNin('');
    setDob('');
    setSelfiePreview('');
    setEmployerName('');
    setJobTitle('');
    setMonthlyIncomeNaira('');
    setAddressText('');
    setRefSubmitted([]);
    setGuarantorInviteCode('');
    setSummary(null);
    setSuccessNotice('');
  };

  const stepsList: { key: Step; label: string; icon: any }[] = [
    { key: 'consent', label: 'Consent', icon: ShieldCheck },
    { key: 'identity', label: 'Identity', icon: User },
    { key: 'selfie', label: 'Liveness', icon: Camera },
    { key: 'employment', label: 'Income', icon: Briefcase },
    { key: 'address', label: 'Address', icon: MapPin },
    { key: 'references', label: 'Guarantor', icon: Users },
    { key: 'summary', label: 'Overview', icon: BadgeCheck },
  ];

  const currentStepIndex = stepsList.findIndex(s => s.key === activeStep);

  if (token && request?.identity_provider === 'interswitch') {
    return <CompleteCheckTenant token={token} property={request.property_title} />;
  }

  return (
    <main className="tt-tenant-page min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="tt-tenant-wrap max-w-xl mx-auto">
        {/* Header Bar */}
        <header className="tt-tenant-header flex items-center justify-between pb-6 border-b border-slate-200">
          <Brand />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skipToMockReview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition active:scale-95"
              title="Skip verification screens and view a completed mock review"
            >
              <Sparkles size={14} /> Skip to Mock Review
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Lock size={13} /> 256-bit Encrypted
            </span>
          </div>
        </header>

        {/* Demo Mode Fast-Forward Banner */}
        {activeStep !== 'summary' && !consentRevoked && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-950 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-lg bg-amber-200/80 text-amber-800 shrink-0">
                <Sparkles size={16} />
              </span>
              <span className="truncate">
                <strong>Demo Mode:</strong> Skip all verification screens to preview a completed review with sample data.
              </span>
            </div>
            <button
              type="button"
              onClick={skipToMockReview}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition shadow-xs active:scale-95"
            >
              Fast-Forward ⚡
            </button>
          </div>
        )}

        {/* Property & Request context if available */}
        {request && (
          <div className="mt-4 p-4 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-3">
            <ShieldCheck className="text-blue-700 mt-0.5 shrink-0" size={20} />
            <div className="text-sm">
              <p className="font-semibold text-slate-900">
                {request.landlord_name} requested verification for <span className="text-blue-900">{request.property_title}</span>
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                Applicant: <span className="font-medium text-slate-800">{request.tenant_name}</span>
              </p>
            </div>
          </div>
        )}

        {/* Global Notifications */}
        {error && (
          <div className="mt-4">
            <Toast tone="error">{error}</Toast>
          </div>
        )}
        {successNotice && (
          <div className="mt-4">
            <Toast tone="success">{successNotice}</Toast>
          </div>
        )}

        {/* Interactive Stepper Navigation */}
        {!consentRevoked && (
          <nav aria-label="Verification progress" className="my-6">
            <ol className="flex items-center justify-between overflow-x-auto pb-2 text-xs">
              {stepsList.map((st, idx) => {
                const isPassed = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const IconComponent = st.icon;
                return (
                  <li
                    key={st.key}
                    onClick={() => setActiveStep(st.key)}
                    role="button"
                    tabIndex={0}
                    title={`Click to jump to ${st.label}`}
                    className={`flex flex-col items-center gap-1 min-w-[58px] cursor-pointer hover:opacity-90 transition ${
                      isCurrent
                        ? 'text-blue-700 font-bold'
                        : isPassed
                        ? 'text-emerald-700 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-100'
                          : isPassed
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-white text-slate-400 border-slate-200'
                      }`}
                    >
                      {isPassed ? <Check size={16} /> : <IconComponent size={15} />}
                    </div>
                    <span className="hidden sm:inline text-[11px] whitespace-nowrap">{st.label}</span>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {/* Step Contents */}
        {loading ? (
          <Card className="p-8 text-center">
            <div className="animate-spin text-blue-600 mx-auto w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            <p className="mt-4 text-sm font-medium text-slate-600">Initializing secure verification session…</p>
          </Card>
        ) : consentRevoked ? (
          <Card className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 mx-auto flex items-center justify-center mb-4">
              <XCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Verification Consent Revoked</h2>
            <p className="text-sm text-slate-600 mt-2">
              Your consent has been successfully revoked. Sensitive identity, employment, and address records have been scheduled for purge according to policy.
            </p>
          </Card>
        ) : (
          <>
            {/* ─── STEP 1: CONSENT ─────────────────────────────────────── */}
            {activeStep === 'consent' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <ShieldCheck size={26} />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Consent & Privacy Disclosure</h1>
                    <p className="text-xs text-slate-500">TenTrust Security & NDPR Compliance Policy v{policy?.version || '2026-10-25'}</p>
                  </div>
                </div>

                <div className="text-sm text-slate-600 space-y-3 my-4">
                  <p>
                    TenTrust collects and verifies evidence on behalf of your tenancy application. We safeguard your privacy through strict technical boundaries:
                  </p>
                  <ul className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Private ID numbers:</strong> Your raw BVN, NIN, and bank accounts are never shown to your landlord.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Human review:</strong> Decisions are audited by certified human reviewers, not black-box automated scoring.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Automatic data purge:</strong> Verification evidence is automatically purged after {policy?.retention_days || 30} days.</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 space-y-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Authorized Purposes</label>
                  {ALL_PURPOSES.map(purp => {
                    const checked = selectedPurposes.includes(purp);
                    return (
                      <label
                        key={purp}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          checked ? 'bg-blue-50/50 border-blue-200 text-slate-900' : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedPurposes(prev => [...prev, purp]);
                            } else {
                              setSelectedPurposes(prev => prev.filter(p => p !== purp));
                            }
                          }}
                          className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs sm:text-sm capitalize">
                          {purp === 'summary_sharing' ? 'Share privacy-safe summary with landlord' : `${purp.replace('_', ' ')} verification`}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleConsentSubmit}
                    loading={busy}
                    disabled={selectedPurposes.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-blue-700 transition"
                  >
                    Agree & Proceed <ArrowRight size={18} />
                  </Button>
                </div>
              </Card>
            )}

            {/* ─── STEP 2: IDENTITY ───────────────────────────────────── */}
            {activeStep === 'identity' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <User size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Identity Verification</h2>
                    <p className="text-xs text-slate-500">Cross-reference BVN & NIN official records</p>
                  </div>
                </div>

                <form onSubmit={handleIdentitySubmit} className="space-y-4">
                  {/* BVN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank Verification Number (BVN)
                    </label>
                    <div className="relative">
                      <input
                        type={showBvn ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={11}
                        value={bvn}
                        onChange={e => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="11 digits"
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBvn(!showBvn)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showBvn ? <EyeSlash size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Dial *565*0# on your registered SIM to retrieve your BVN.</p>
                  </div>

                  {/* NIN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      National Identity Number (NIN)
                    </label>
                    <div className="relative">
                      <input
                        type={showNin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={11}
                        value={nin}
                        onChange={e => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="11 digits"
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNin(!showNin)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showNin ? <EyeSlash size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Dial *346# on your registered SIM to check your NIN.</p>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dob}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setDob(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Must match the date on your official government ID records.</p>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() => setActiveStep('consent')}
                      className="px-4 py-2.5 text-sm"
                    >
                      <ArrowLeft size={16} /> Back
                    </Button>
                    <Button
                      type="submit"
                      loading={busy}
                      disabled={bvn.length !== 11 || nin.length !== 11}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                    >
                      Verify Identity Details <ArrowRight size={18} />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ─── STEP 2b: OTP VERIFICATION ─────────────────────────── */}
            {activeStep === 'otp' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <ShieldCheck size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">BVN OTP Authentication</h2>
                    <p className="text-xs text-slate-500">Confirm ownership through bank-registered OTP</p>
                  </div>
                </div>

                {!otpSent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Choose how you would like to receive the one-time verification code from the identity provider:
                    </p>
                    <div className="grid gap-2">
                      {allowedMethods.map(m => (
                        <label
                          key={m}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                            selectedMethod === m
                              ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="otpMethod"
                            value={m}
                            checked={selectedMethod === m}
                            onChange={() => setSelectedMethod(m as any)}
                            className="text-blue-600"
                          />
                          <span className="capitalize">{m.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>

                    {selectedMethod === 'alternate_phone' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Alternate Phone Number</label>
                        <input
                          type="tel"
                          value={alternatePhone}
                          onChange={e => setAlternatePhone(e.target.value)}
                          placeholder="+234..."
                          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                        />
                      </div>
                    )}

                    <div className="pt-2 flex gap-3">
                      <Button type="button" kind="secondary" onClick={() => setActiveStep('identity')}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSendOtp}
                        loading={busy}
                        className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl"
                      >
                        Send Verification Code
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Enter the one-time security code delivered via <strong>{selectedMethod.replace('_', ' ')}</strong>:
                    </p>
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\s+/g, ''))}
                        placeholder="Enter code"
                        className="w-full text-center tracking-widest text-xl font-bold py-3 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={busy}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Resend Code
                      </button>
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        className="text-slate-500 hover:underline"
                      >
                        Change delivery method
                      </button>
                    </div>
                    <div className="pt-2 flex gap-3">
                      <Button
                        type="submit"
                        loading={busy}
                        disabled={otpCode.length < 4}
                        className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                      >
                        Verify & Continue <ArrowRight size={18} />
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )}

            {/* ─── STEP 3: SELFIE & LIVENESS ─────────────────────────── */}
            {activeStep === 'selfie' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <Camera size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Liveness & Selfie Verification</h2>
                    <p className="text-xs text-slate-500">Reviewer photo comparison (Max 3 attempts)</p>
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 mb-4">
                  <p className="font-semibold text-slate-800">For best results:</p>
                  <p>• Ensure good lighting with your face centered.</p>
                  <p>• Remove glasses, hats, or masks.</p>
                  <p>• Plain background preferred; neutral facial expression.</p>
                </div>

                <div className="my-4 text-center">
                  {selfiePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={selfiePreview}
                        alt="Selfie preview"
                        className="w-48 h-48 sm:w-56 sm:h-56 object-cover rounded-full border-4 border-blue-500 shadow-md mx-auto"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSelfieFile(null);
                          setSelfiePreview('');
                        }}
                        className="absolute bottom-1 right-1 p-2 rounded-full bg-slate-800 text-white shadow hover:bg-slate-900"
                        title="Retake photo"
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-12 px-4 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition"
                    >
                      <Camera size={44} className="text-slate-400 mb-2" />
                      <p className="text-sm font-semibold text-slate-700">Take or Upload a Selfie Photo</p>
                      <p className="text-xs text-slate-500 mt-1">JPEG or PNG format, up to 5 MB</p>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="user"
                    onChange={handleSelfieSelect}
                    className="hidden"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <Button type="button" kind="secondary" onClick={() => setActiveStep('identity')}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSelfieSubmit}
                    loading={busy}
                    disabled={!selfieFile}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                  >
                    Confirm Selfie <ArrowRight size={18} />
                  </Button>
                </div>
              </Card>
            )}

            {/* ─── STEP 4: EMPLOYMENT & AFFORDABILITY ────────────────── */}
            {activeStep === 'employment' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <Briefcase size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Employment & Affordability</h2>
                    <p className="text-xs text-slate-500">Income proof for rent-to-income assessment</p>
                  </div>
                </div>

                <form onSubmit={handleEmploymentSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEmploymentType('employed')}
                      className={`py-2 text-xs font-bold rounded-lg transition ${
                        employmentType === 'employed' ? 'bg-white shadow text-blue-700' : 'text-slate-600'
                      }`}
                    >
                      Salaried Employed
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmploymentType('self_employed')}
                      className={`py-2 text-xs font-bold rounded-lg transition ${
                        employmentType === 'self_employed' ? 'bg-white shadow text-blue-700' : 'text-slate-600'
                      }`}
                    >
                      Self-Employed / Business
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {employmentType === 'employed' ? 'Employer / Company Name' : 'Business / Trade Name'}
                    </label>
                    <input
                      type="text"
                      required
                      value={employerName}
                      onChange={e => setEmployerName(e.target.value)}
                      placeholder="e.g. Flutterwave Technologies Ltd"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Job Title / Role</label>
                    <input
                      type="text"
                      required
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Net Income (₦)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={monthlyIncomeNaira}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setMonthlyIncomeNaira(raw ? Number(raw).toLocaleString('en-NG') : '');
                      }}
                      placeholder="e.g. 750,000"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-900"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Exact income is kept confidential from your landlord.</p>
                  </div>

                  {employmentType === 'self_employed' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">CAC Registration (Optional)</label>
                      <input
                        type="text"
                        value={cacNumber}
                        onChange={e => setCacNumber(e.target.value)}
                        placeholder="RC / BN Number"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Proof of Income Document</label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-600 bg-slate-50 cursor-pointer flex items-center justify-between hover:bg-slate-100">
                        <span className="truncate">{employmentDoc ? employmentDoc.name : 'Select Payslip / Letter / Statement'}</span>
                        <UploadCloud size={16} className="text-slate-400 shrink-0" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          onChange={e => setEmploymentDoc(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">PDF or image, max 5 MB.</p>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button type="button" kind="secondary" onClick={() => setActiveStep('selfie')}>
                      Back
                    </Button>
                    <Button
                      type="submit"
                      loading={busy}
                      disabled={!employerName || !jobTitle || !monthlyIncomeNaira || !employmentDoc}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                    >
                      Save Employment Proof <ArrowRight size={18} />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ─── STEP 5: RESIDENTIAL ADDRESS ───────────────────────── */}
            {activeStep === 'address' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <MapPin size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Residential Address Proof</h2>
                    <p className="text-xs text-slate-500">Provide current verifiable residential address</p>
                  </div>
                </div>

                <form onSubmit={handleAddressSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Current Address</label>
                    <textarea
                      required
                      rows={3}
                      value={addressText}
                      onChange={e => setAddressText(e.target.value)}
                      placeholder="e.g. Flat 4B, Richmond Court, Lekki Phase 1, Lagos"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Proof Document Type</label>
                    <select
                      value={proofType}
                      onChange={e => setProofType(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                    >
                      <option value="utility_bill">Recent Utility Bill (Electricity / Water / Waste)</option>
                      <option value="tenancy_agreement">Current Tenancy Agreement</option>
                      <option value="other">Other Official Government / Bank Proof</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Proof Document</label>
                    <label className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-600 bg-slate-50 cursor-pointer flex items-center justify-between hover:bg-slate-100">
                      <span className="truncate">{addressDoc ? addressDoc.name : 'Choose Utility Bill or Agreement'}</span>
                      <UploadCloud size={16} className="text-slate-400 shrink-0" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={e => setAddressDoc(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 mt-1">Must show your name and match the declared address.</p>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button type="button" kind="secondary" onClick={() => setActiveStep('employment')}>
                      Back
                    </Button>
                    <Button
                      type="submit"
                      loading={busy}
                      disabled={addressText.length < 8 || !addressDoc}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                    >
                      Confirm Address <ArrowRight size={18} />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ─── STEP 6: REFERENCES & GUARANTOR ────────────────────── */}
            {activeStep === 'references' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                    <Users size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">References & Guarantor (Optional)</h2>
                    <p className="text-xs text-slate-500">Strengthen your application profile</p>
                  </div>
                </div>

                {/* Reference submission */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 mb-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Add Reference Contact</h3>
                  <form onSubmit={handleAddReference} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={refType}
                        onChange={e => setRefType(e.target.value as any)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="previous_landlord">Previous Landlord</option>
                        <option value="professional">Professional / Employer</option>
                        <option value="personal">Personal / Character</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Contact Full Name"
                        value={refName}
                        onChange={e => setRefName(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        value={refPhone}
                        onChange={e => setRefPhone(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                      />
                      <input
                        type="email"
                        placeholder="Email (Optional)"
                        value={refEmail}
                        onChange={e => setRefEmail(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                      />
                    </div>
                    <Button type="submit" loading={busy} className="text-xs py-2 px-3">
                      Add Reference
                    </Button>
                  </form>

                  {refSubmitted.length > 0 && (
                    <div className="mt-3 text-xs text-slate-600">
                      <span className="font-semibold">Added Contacts:</span>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {refSubmitted.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Guarantor section */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 mb-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Invite a Guarantor</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    A guarantor will receive an invitation link to verify their identity separately.
                  </p>
                  {!guarantorInviteCode ? (
                    <form onSubmit={handleInviteGuarantor} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Guarantor Full Name"
                          value={guarantorName}
                          onChange={e => setGuarantorName(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                        <input
                          type="tel"
                          placeholder="Guarantor Phone"
                          value={guarantorPhone}
                          onChange={e => setGuarantorPhone(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="email"
                          placeholder="Guarantor Email"
                          value={guarantorEmail}
                          onChange={e => setGuarantorEmail(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Relationship (e.g. Parent, Sibling)"
                          value={guarantorRel}
                          onChange={e => setGuarantorRel(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                      <Button type="submit" loading={busy} className="text-xs py-2 px-3">
                        Generate Guarantor Invitation
                      </Button>
                    </form>
                  ) : (
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-600 mb-1 font-semibold">Guarantor Invitation Code:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-slate-100 p-2 rounded flex-1 truncate">{guarantorInviteCode}</code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(guarantorInviteCode);
                            setCopiedInvite(true);
                            setTimeout(() => setCopiedInvite(false), 2000);
                          }}
                          className="px-3 py-2 text-xs bg-blue-600 text-white rounded font-medium flex items-center gap-1"
                        >
                          {copiedInvite ? <Check size={14} /> : <Copy size={14} />} {copiedInvite ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-3">
                  <Button type="button" kind="secondary" onClick={() => setActiveStep('address')}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setActiveStep('summary')}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition"
                  >
                    Complete & View Summary <ArrowRight size={18} />
                  </Button>
                </div>
              </Card>
            )}

            {/* ─── STEP 7: SUMMARY & STATUS ──────────────────────────── */}
            {activeStep === 'summary' && (
              <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="text-center pb-6 border-b border-slate-200">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                    <BadgeCheck size={36} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Verification Submitted</h2>
                  <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                    Your evidence package has been securely submitted and logged for human reviewer verification.
                  </p>
                </div>

                {/* Evidence Checklist */}
                <div className="my-6 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Verification Checklist</h3>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <span>Identity Records (BVN / NIN)</span>
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {identityVerified ? 'Verified' : 'Submitted'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <span>Selfie Liveness</span>
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {selfieDone ? 'Pending Review' : 'Submitted'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <span>Employment & Income Proof</span>
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {employmentDone ? 'Pending Review' : 'Submitted'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <span>Residential Address</span>
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {addressDone ? (isMockMode ? 'Verified' : 'Pending Review') : 'Submitted'}
                      </span>
                    </div>

                    {isMockMode && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                          <span>Guarantor & References</span>
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Verified
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mock Review Breakdown Card */}
                {isMockMode && (
                  <div className="my-6 p-4 rounded-xl bg-gradient-to-br from-blue-50/70 to-slate-50 border border-blue-200 text-slate-800 space-y-4">
                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-500" />
                        <h3 className="font-bold text-sm text-slate-900">Mock Verified Review Details</h3>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        AUDIT STATUS: PASS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Identity */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center text-slate-500 font-semibold mb-1">
                          <span>Identity Record</span>
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <p>Name: <strong>Oluwaseun Adeleke</strong></p>
                        <p>BVN: <code>222 •••• 7891</code> (Mono Verified)</p>
                        <p>NIN: <code>102 •••• 7561</code> (NIMC Verified)</p>
                        <p>DOB: <strong>18 Jun 1994</strong> · Match: <strong>100%</strong></p>
                      </div>

                      {/* Liveness */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center text-slate-500 font-semibold mb-1">
                          <span>Facial Biometrics</span>
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <div className="flex items-center gap-2">
                          <img
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                            alt="Selfie thumbnail"
                            className="w-10 h-10 rounded-full object-cover border"
                          />
                          <div>
                            <p className="font-bold text-emerald-700">98.4% Match Score</p>
                            <p className="text-[11px] text-slate-500">Live human comparison verified</p>
                          </div>
                        </div>
                      </div>

                      {/* Employment & Affordability */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center text-slate-500 font-semibold mb-1">
                          <span>Employment & Income</span>
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <p>Employer: <strong>Paystack Payments Ltd</strong></p>
                        <p>Role: <strong>Senior Product Designer</strong></p>
                        <p>Monthly Net: <strong>₦950,000</strong></p>
                        <p>Rent-to-Income: <strong>28.4%</strong> (Approved)</p>
                      </div>

                      {/* Address & Guarantor */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center text-slate-500 font-semibold mb-1">
                          <span>Address & Guarantor</span>
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <p>Address: <strong>Lekki Phase 1, Lagos</strong></p>
                        <p>Proof: <strong>EKEDC Utility Bill (Verified)</strong></p>
                        <p>Guarantor: <strong>Dr. Olumide Adeleke</strong></p>
                        <p>Status: <strong>Accepted & Verified</strong></p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-blue-200/50">
                      <span>Auditor: Compliance Reviewer #41</span>
                      <button
                        type="button"
                        onClick={resetDemo}
                        className="text-blue-700 hover:underline font-semibold flex items-center gap-1"
                      >
                        <RotateCcw size={13} /> Reset Demo Flow
                      </button>
                    </div>
                  </div>
                )}

                {/* Privacy Reminder */}
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-blue-900">What your landlord sees:</p>
                  <p>
                    Your landlord receives a privacy-protected summary indicating whether the checks passed. Your sensitive BVN, NIN, payslips, and bank details are never disclosed.
                  </p>
                </div>

                {/* Actions: Dispute & Revoke */}
                <div className="mt-6 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setDisputeOpen(!disputeOpen)}
                    className="text-slate-600 hover:text-slate-900 font-medium underline"
                  >
                    Need to dispute a check?
                  </button>

                  <button
                    type="button"
                    onClick={handleRevokeConsent}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Revoke Consent & Purge Data
                  </button>
                </div>

                {disputeOpen && (
                  <form onSubmit={handleDispute} className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">Reason for Dispute</label>
                    <textarea
                      required
                      rows={3}
                      value={disputeReason}
                      onChange={e => setDisputeReason(e.target.value)}
                      placeholder="Explain what detail or check needs human correction (at least 10 characters)..."
                      className="w-full p-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDisputeOpen(false)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                      <Button type="submit" loading={busy} className="text-xs py-1.5 px-3 bg-slate-900 text-white">
                        Submit Dispute
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )}
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} TenTrust Technologies Limited. All verification operations are logged and audited.</p>
        </footer>
      </div>
    </main>
  );
}
