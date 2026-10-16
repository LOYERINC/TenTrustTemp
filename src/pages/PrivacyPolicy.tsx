import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock } from '../lib/icons';

export default function PrivacyPolicy() {
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
          <Link to="/terms" className="text-xs font-semibold text-[#0747a6] hover:underline hidden sm:block">
            Terms of Service →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-[#0747a6] px-3 py-1 rounded-full text-xs font-bold mb-4">
            <Lock className="w-3.5 h-3.5" />
            Privacy
          </div>
          <h1 className="text-4xl font-heading font-black text-[#0c2340] tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 mt-2 text-sm">Last updated: September 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-700">In short: we use your details to run the checks you ask for, keep a record of the result, and protect your account. This page tells you what we collect and what you can ask us to change or remove.</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-8 sm:p-12 space-y-8 text-slate-700 leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">1. Introduction</h2>
            <p className="text-sm">TenTrust ("we", "our", or "us") is committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform. Please read this policy carefully.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">2. Information We Collect</h2>
            <p className="text-sm">We collect the following categories of personal information:</p>
            <ul className="list-disc list-inside text-sm space-y-1.5 pl-2">
              <li><strong>Landlord Account Data:</strong> Name, email address, phone number, and government-issued ID for KYB verification.</li>
              <li><strong>Tenant Verification Data:</strong> Bank Verification Number (BVN), National Identification Number (NIN), full name, date of birth, and financial history — collected only with explicit tenant consent.</li>
              <li><strong>Usage Data:</strong> IP address, browser type, pages visited, and interaction logs to improve our service.</li>
              <li><strong>Payment Data:</strong> Transaction records processed through our secure payment gateway (we do not store full card details).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">3. How We Use Your Information</h2>
            <p className="text-sm">We use the information we collect to:</p>
            <ul className="list-disc list-inside text-sm space-y-1.5 pl-2">
              <li>Provide and operate the TenTrust tenant verification service.</li>
              <li>Process identity and credit checks via Prembly and Mono APIs.</li>
              <li>Communicate service updates, billing notices, and support responses.</li>
              <li>Comply with legal obligations under the NDPR and applicable regulations.</li>
              <li>Detect, prevent, and address fraud or security issues.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">4. Third-Party Data Processors</h2>
            <p className="text-sm">TenTrust uses the following licensed third-party services to process verification data:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {[
                { name: 'Mono', purpose: 'Credit history lookup via Nigerian credit bureaus (CRC, XDS)', url: 'https://mono.co' },
                { name: 'Prembly (Identitypass)', purpose: 'BVN & NIN identity verification and KYC screening', url: 'https://prembly.com' },
                { name: 'Firebase / Google', purpose: 'Authentication, database, and cloud hosting', url: 'https://firebase.google.com' },
              ].map((p) => (
                <div key={p.name} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-[#0c2340]">{p.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.purpose}</p>
                </div>
              ))}
            </div>
            <p className="text-sm">Each provider maintains their own privacy policy and data protection standards compliant with Nigerian law.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">5. Data Retention</h2>
            <p className="text-sm">Tenant verification records are retained for a maximum of 24 months after the date of verification, after which they are securely deleted. Landlord account data is retained for the duration of your account and for 12 months following account closure for legal compliance purposes.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">6. Your Rights (NDPR)</h2>
            <p className="text-sm">Under the Nigeria Data Protection Regulation (NDPR), you have the right to:</p>
            <ul className="list-disc list-inside text-sm space-y-1.5 pl-2">
              <li>Access a copy of your personal data held by us.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request erasure of your data ("right to be forgotten").</li>
              <li>Object to processing of your data for certain purposes.</li>
              <li>Lodge a complaint with the National Information Technology Development Agency (NITDA).</li>
            </ul>
            <p className="text-sm">To exercise any of these rights, contact us at <a href="mailto:privacy@tentrust.ng" className="text-[#0747a6] font-semibold hover:underline">privacy@tentrust.ng</a>.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">7. Security</h2>
            <p className="text-sm">We implement industry-standard security measures including TLS encryption in transit, encrypted data at rest, role-based access controls, and regular security audits to protect your data. However, no method of transmission over the internet is 100% secure.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">8. Changes to This Policy</h2>
            <p className="text-sm">We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the "Last updated" date. Continued use of the Service after changes constitutes acceptance of the revised policy.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0c2340]">9. Contact Us</h2>
            <p className="text-sm">For privacy-related enquiries, contact our Data Protection Officer: <a href="mailto:privacy@tentrust.ng" className="text-[#0747a6] font-semibold hover:underline">privacy@tentrust.ng</a></p>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
          <Link to="/terms" className="text-sm font-semibold text-[#0747a6] hover:underline">
            View Terms of Service →
          </Link>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to TenTrust
          </Link>
        </div>
      </main>
    </div>
  );
}
