import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText } from '../lib/icons';

export default function TermsOfService() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0747a6] bg-slate-100 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="bg-[#0747a6] p-1.5 rounded-lg text-white">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-heading font-black text-xl text-[#0c2340]">TenTrust</span>
            </div>
          </div>
          <Link to="/privacy" className="text-xs font-semibold text-[#0747a6] hover:underline hidden sm:block">
            Privacy Policy →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-[#0747a6] px-3 py-1 rounded-full text-xs font-bold mb-4">
            <FileText className="w-3.5 h-3.5" />
            Legal
          </div>
          <h1 className="text-4xl font-heading font-black text-[#0c2340] tracking-tight">Terms of Service</h1>
          <p className="text-slate-500 mt-2 text-sm">Last updated: September 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-700">In short: use TenTrust to check a home request, get the tenant’s yes first, and keep their details private. The rules below explain this in full.</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-8 sm:p-12 space-y-8 text-slate-700 leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">1. Acceptance of Terms</h2>
            <p className="text-sm">By accessing or using the TenTrust platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, you may not access the Service. These Terms apply to all visitors, users, and others who access or use the Service.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">2. Description of Service</h2>
            <p className="text-sm">TenTrust provides a digital platform for landlords and property managers to conduct identity verification (KYC), credit history checks, and background screening of prospective tenants in Nigeria. Our services integrate with licensed third-party providers including Mono (for financial data) and Prembly (for identity verification).</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">3. User Accounts & Eligibility</h2>
            <p className="text-sm">To use TenTrust, you must:</p>
            <ul className="list-disc list-inside text-sm space-y-1.5 pl-2">
              <li>Be at least 18 years of age.</li>
              <li>Be a registered landlord or authorised property agent.</li>
              <li>Provide accurate and complete registration information.</li>
              <li>Maintain the security of your account credentials.</li>
            </ul>
            <p className="text-sm">You are responsible for all activity that occurs under your account.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">4. Tenant Data & Consent</h2>
            <p className="text-sm">You must obtain explicit, informed consent from any prospective tenant before initiating a verification check on their behalf. TenTrust operates strictly as a data processor. You, as the landlord or agent, are the data controller and are responsible for ensuring lawful grounds for processing tenant personal data in accordance with the Nigeria Data Protection Regulation (NDPR) and applicable laws.</p>
            <p className="text-sm font-semibold text-[#0c2340]">Running a verification check without tenant consent is strictly prohibited and may result in immediate account suspension.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">5. Permitted Use</h2>
            <p className="text-sm">You agree to use TenTrust solely for lawful tenant screening purposes. You must not:</p>
            <ul className="list-disc list-inside text-sm space-y-1.5 pl-2">
              <li>Use verification data for any purpose other than evaluating tenancy applications.</li>
              <li>Share, sell, or disclose tenant verification data to third parties.</li>
              <li>Use the platform to discriminate against tenants based on protected characteristics.</li>
              <li>Attempt to reverse-engineer, hack, or disrupt the platform or its integrations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">6. Fees & Payment</h2>
            <p className="text-sm">Access to certain features of TenTrust requires payment of fees as outlined on our pricing page. All fees are in Nigerian Naira (NGN) and are non-refundable unless otherwise stated. TenTrust reserves the right to modify its pricing at any time with 30 days' notice.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">7. Limitation of Liability</h2>
            <p className="text-sm">TenTrust provides verification results based on data obtained from licensed third-party bureaus. We do not guarantee the accuracy, completeness, or fitness of bureau data for any particular purpose. TenTrust shall not be liable for any tenancy disputes, losses, or damages arising from reliance on verification reports.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">8. Termination</h2>
            <p className="text-sm">TenTrust reserves the right to suspend or terminate your access to the Service at any time, with or without notice, for conduct that we believe violates these Terms or is harmful to other users, third parties, or the business interests of TenTrust.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">9. Governing Law</h2>
            <p className="text-sm">These Terms shall be governed and construed in accordance with the laws of the Federal Republic of Nigeria. Any disputes arising in connection with these Terms shall be subject to the exclusive jurisdiction of Nigerian courts.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">10. Contact Us</h2>
            <p className="text-sm">For questions about these Terms, please contact us at: <a href="mailto:legal@tentrust.ng" className="text-[#0747a6] font-semibold hover:underline">legal@tentrust.ng</a></p>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
          <Link to="/privacy" className="text-sm font-semibold text-[#0747a6] hover:underline">
            View Privacy Policy →
          </Link>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to TenTrust
          </Link>
        </div>
      </main>
    </div>
  );
}
