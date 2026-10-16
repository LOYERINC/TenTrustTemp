import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, FileText, Lock, CheckCircle2, X } from '../lib/icons';

const STORAGE_KEY = 'tentrust_terms_accepted';

export default function TermsAcceptanceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setIsOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    if (!checked) return;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      {/* Modal */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
        {/* Top bar */}
        <div className="brand-banner-art px-6 py-5 flex items-center gap-3 text-white">
          <div className="p-2 bg-white/15 rounded-xl">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-black text-white text-lg tracking-tight">Welcome to TenTrust</h2>
            <p className="text-blue-200 text-xs mt-0.5">Please read these rules before you go on.</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0747a6] shrink-0" />
                <p className="text-xs font-bold text-[#0c2340]">Terms of Service</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Use TenTrust only to check a tenant. Get the tenant's yes before any check.
              </p>
              <Link
                to="/terms"
                target="_blank"
                className="text-[11px] font-bold text-[#0747a6] hover:underline"
              >
                Read full Terms →
              </Link>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-[#0c2340]">Privacy Policy</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                We use the details needed for each check. See how we use and keep your data.
              </p>
              <Link
                to="/privacy"
                target="_blank"
                className="text-[11px] font-bold text-emerald-600 hover:underline"
              >
                Read Privacy Policy →
              </Link>
            </div>
          </div>

          {/* Key points */}
          <div className="space-y-2">
            {[
              'Get the tenant’s yes before a check starts.',
              'Use tenant details only to review a home request.',
              'Mono and other check firms may help us run checks.',
            ].map((point) => (
              <div key={point} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">{point}</p>
              </div>
            ))}
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none
            border-slate-200 hover:border-[#0747a6]/40 has-[:checked]:border-[#0747a6] has-[:checked]:bg-blue-50/60">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#0747a6] w-4 h-4 shrink-0"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              I read and agree to TenTrust's{' '}
              <Link to="/terms" target="_blank" className="text-[#0747a6] font-semibold hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" className="text-emerald-600 font-semibold hover:underline">Privacy Policy</Link>.
              I will get the tenant’s yes before I start a check.
            </span>
          </label>

          {/* Actions */}
          <button
            onClick={handleAccept}
            disabled={!checked}
            className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
              bg-[#0747a6] hover:bg-[#063c8f] text-white shadow-md shadow-[#0747a6]/20
              disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            I agree — continue
          </button>

          <p className="text-center text-[10px] text-slate-400">
            We save your choice on this device. You will not see this again here.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Utility hook — lets any component check if terms have been accepted */
export function useTermsAccepted() {
  return !!localStorage.getItem(STORAGE_KEY);
}

/** Utility — programmatically reset acceptance (for testing) */
export function resetTermsAcceptance() {
  localStorage.removeItem(STORAGE_KEY);
}
