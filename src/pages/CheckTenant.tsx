import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Send, 
  Copy, 
  Check, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  User, 
  Building, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  ExternalLink,
  Sparkles,
  RefreshCw,
  FileCheck
} from 'lucide-react';

interface SentCheck {
  id: string;
  name: string;
  phone: string;
  email: string;
  property: string;
  sentDate: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  channel: 'WhatsApp' | 'Email' | 'Link';
  score?: number;
}

export default function CheckTenant() {
  const [tenantName, setTenantName] = useState('');
  const [countryCode, setCountryCode] = useState('+44');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [property, setProperty] = useState('Luxury Apartment 4B, Kensington');
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState<string | null>(null);

  // Default checks list
  const [sentChecks, setSentChecks] = useState<SentCheck[]>([
    {
      id: 'TC-9021',
      name: 'Sarah Jenkins',
      phone: '+44 7700 900077',
      email: 'sarah.j@example.com',
      property: 'Penthouse 12A, Riverside',
      sentDate: '10 minutes ago',
      status: 'Pending',
      channel: 'WhatsApp'
    },
    {
      id: 'TC-8940',
      name: 'Marcus Vance',
      phone: '+44 7700 900123',
      email: 'm.vance@example.com',
      property: 'Studio 3, Fitzrovia',
      sentDate: '2 hours ago',
      status: 'In Progress',
      channel: 'WhatsApp'
    },
    {
      id: 'TC-7811',
      name: 'Elena Rostova',
      phone: '+44 7700 900456',
      email: 'elena.r@example.com',
      property: 'Luxury Apartment 4B, Kensington',
      sentDate: 'Yesterday',
      status: 'Completed',
      channel: 'Email',
      score: 96
    }
  ]);

  // Selected checks to include
  const [requirements, setRequirements] = useState({
    idVerify: true,
    incomeCheck: true,
    rightToRent: true,
    landlordRef: true
  });

  const generateLink = () => {
    const cleanName = encodeURIComponent(tenantName || 'Tenant');
    const cleanProp = encodeURIComponent(property);
    return `${window.location.origin}/apply/prop-101?tenant=${cleanName}&ref=${cleanProp}`;
  };

  const getWhatsAppMessage = () => {
    const link = generateLink();
    const message = `Hello ${tenantName || 'there'}, your landlord has invited you to complete your quick tenant check with TenTrust.\n\n` +
      `📌 Property: ${property}\n` +
      `⚡ Takes under 3 minutes on WhatsApp or web.\n\n` +
      `Complete your verification link here: ${link}`;
    return encodeURIComponent(message);
  };

  const handleSendWhatsApp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const formattedPhone = (countryCode + tenantPhone).replace(/\s+/g, '').replace('+', '');
    const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${getWhatsAppMessage()}`;
    
    // Add to history list
    if (tenantName) {
      const newCheck: SentCheck = {
        id: `TC-${Math.floor(1000 + Math.random() * 9000)}`,
        name: tenantName,
        phone: `${countryCode} ${tenantPhone}` || 'Not specified',
        email: tenantEmail || 'Not specified',
        property: property,
        sentDate: 'Just now',
        status: 'Pending',
        channel: 'WhatsApp'
      };
      setSentChecks([newCheck, ...sentChecks]);
    }

    setSentSuccess('WhatsApp message generated! Opening WhatsApp...');
    setTimeout(() => setSentSuccess(null), 4000);
    window.open(waUrl, '_blank');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generateLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantEmail) return;
    
    const newCheck: SentCheck = {
      id: `TC-${Math.floor(1000 + Math.random() * 9000)}`,
      name: tenantName || 'Tenant',
      phone: tenantPhone ? `${countryCode} ${tenantPhone}` : 'N/A',
      email: tenantEmail,
      property: property,
      sentDate: 'Just now',
      status: 'Pending',
      channel: 'Email'
    };
    setSentChecks([newCheck, ...sentChecks]);
    setSentSuccess(`Email invitation sent to ${tenantEmail}!`);
    setTimeout(() => setSentSuccess(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#0747a6] selection:text-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              to="/" 
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0747a6] transition-colors bg-slate-100 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0747a6] p-1.5 rounded-lg text-white">
                <Shield className="w-5 h-5 fill-current stroke-none" />
              </div>
              <span className="font-heading font-black text-xl text-[#0c2340]">
                TenTrust <span className="text-slate-500 font-normal text-sm">| Check Tenant</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link 
              to="/dashboard" 
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-[#0747a6] px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Landlord Dashboard
            </Link>
            <Link
              to="/chat"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-full transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Assistant
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Banner Hero */}
        <div className="bg-gradient-to-r from-[#0c2340] via-[#0747a6] to-[#1e3a8a] rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <Shield className="w-96 h-96" />
          </div>
          
          <div className="max-w-2xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5" />
              Instant WhatsApp & Web Screening
            </div>
            <h1 className="text-3xl sm:text-4xl font-heading font-black tracking-tight leading-tight">
              Send Tenant Check Link
            </h1>
            <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
              Send an instant verification link directly to your prospective tenant via WhatsApp or Email. Tenants can complete identity, income, and background checks right from their phone in under 3 minutes.
            </p>
          </div>
        </div>

        {sentSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold">{sentSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form & Send Card (8 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-heading font-bold text-[#0c2340]">
                    Tenant Verification Details
                  </h2>
                  <p className="text-xs text-slate-500">Fill in tenant info to generate a personalized link</p>
                </div>
                <span className="bg-blue-50 text-[#0747a6] text-xs font-bold px-3 py-1 rounded-full border border-blue-100">
                  Step 1 of 2
                </span>
              </div>

              <form onSubmit={handleSendWhatsApp} className="space-y-4">
                
                {/* Tenant Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tenant Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/20 text-sm font-medium outline-hidden transition-all bg-slate-50/50 focus:bg-white"
                      required
                    />
                  </div>
                </div>

                {/* Property selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Property Address / Reference
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. Apartment 4B, Kensington Green"
                      value={property}
                      onChange={(e) => setProperty(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/20 text-sm font-medium outline-hidden transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* WhatsApp / Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Phone Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:border-[#0747a6] outline-hidden shrink-0"
                    >
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+33">🇫🇷 +33</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+234">🇳🇬 +234</option>
                      <option value="+61">🇦🇺 +61</option>
                    </select>
                    <div className="relative flex-1">
                      <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        placeholder="7700 900123"
                        value={tenantPhone}
                        onChange={(e) => setTenantPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/20 text-sm font-medium outline-hidden transition-all bg-slate-50/50 focus:bg-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Email Optional */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email Address (Optional)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      placeholder="alex.m@example.com"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#0747a6] focus:ring-2 focus:ring-[#0747a6]/20 text-sm font-medium outline-hidden transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Screening Checks Checklist */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Included Checks in Link
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-700">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-100/60">
                      <input 
                        type="checkbox" 
                        checked={requirements.idVerify}
                        onChange={(e) => setRequirements({...requirements, idVerify: e.target.checked})}
                        className="rounded-xs text-[#0747a6] focus:ring-0" 
                      />
                      <span>Passport / ID Verification</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-100/60">
                      <input 
                        type="checkbox" 
                        checked={requirements.incomeCheck}
                        onChange={(e) => setRequirements({...requirements, incomeCheck: e.target.checked})}
                        className="rounded-xs text-[#0747a6] focus:ring-0" 
                      />
                      <span>Income & Payslip AI Check</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-100/60">
                      <input 
                        type="checkbox" 
                        checked={requirements.rightToRent}
                        onChange={(e) => setRequirements({...requirements, rightToRent: e.target.checked})}
                        className="rounded-xs text-[#0747a6] focus:ring-0" 
                      />
                      <span>Right to Rent Check</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-100/60">
                      <input 
                        type="checkbox" 
                        checked={requirements.landlordRef}
                        onChange={(e) => setRequirements({...requirements, landlordRef: e.target.checked})}
                        className="rounded-xs text-[#0747a6] focus:ring-0" 
                      />
                      <span>Landlord Reference</span>
                    </label>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white py-3.5 px-6 rounded-2xl font-bold text-sm shadow-md shadow-[#25D366]/20 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <MessageSquare className="w-5 h-5 fill-current" />
                    Send via WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    Send Email
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 px-5 rounded-2xl font-bold text-sm border border-slate-200 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>

          {/* Preview & WhatsApp Flow Explanation (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Link Preview Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-[#0c2340] flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-[#0747a6]" />
                Generated Tenant Check Link
              </h3>
              
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 break-all font-mono text-xs text-slate-600">
                {generateLink()}
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  What the tenant experiences:
                </div>
                <ul className="text-xs text-emerald-800 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>Opens directly in <strong>WhatsApp chat</strong> or mobile browser.</li>
                  <li>Guides tenant step-by-step through ID photo scan and payslip upload.</li>
                  <li>No app download required for the tenant!</li>
                  <li>Takes ~3 minutes to complete.</li>
                </ul>
              </div>
            </div>

            {/* Quick Benefits Card */}
            <div className="bg-blue-50/60 rounded-3xl p-6 border border-blue-100/80 space-y-3">
              <h3 className="text-sm font-bold text-[#0c2340] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#0747a6]" />
                Why Landlords Prefer WhatsApp Checks
              </h3>
              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>98% Response Rate:</strong> Tenants complete WhatsApp prompts 5x faster than traditional email forms.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Instant AI Verification:</strong> Documents are automatically analyzed for fraud, income ratio, and credit signals.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Instant Landlord Alert:</strong> Receive notification as soon as tenant finishes their check.</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Sent Checks Tracking Table */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-heading font-bold text-[#0c2340]">
                Active &amp; Recent Tenant Checks
              </h2>
              <p className="text-xs text-slate-500">Track verification progress in real-time</p>
            </div>
            <button 
              onClick={() => setSentSuccess('Refreshed status updates!')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0747a6] bg-slate-100 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Status
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/80">
                  <th className="py-3.5 px-6">Tenant Name</th>
                  <th className="py-3.5 px-6">Property</th>
                  <th className="py-3.5 px-6">Channel</th>
                  <th className="py-3.5 px-6">Sent Date</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {sentChecks.map((check) => (
                  <tr key={check.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-900">
                      <div>{check.name}</div>
                      <div className="text-[11px] font-normal text-slate-500">{check.phone}</div>
                    </td>
                    <td className="py-4 px-6 text-slate-700">{check.property}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        check.channel === 'WhatsApp' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {check.channel === 'WhatsApp' ? <MessageSquare className="w-3 h-3 fill-current" /> : <Mail className="w-3 h-3" />}
                        {check.channel}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {check.sentDate}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {check.status === 'Completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Completed ({check.score}/100)
                        </span>
                      ) : check.status === 'In Progress' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => handleSendWhatsApp()}
                        className="text-[#0747a6] hover:underline font-bold text-xs"
                      >
                        Resend
                      </button>
                      <span className="text-slate-300">|</span>
                      <Link
                        to="/dashboard"
                        className="text-slate-600 hover:text-slate-900 font-semibold text-xs"
                      >
                        View Report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
