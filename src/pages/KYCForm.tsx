import { Link } from 'react-router-dom';
import { ShieldCheck } from '../lib/icons';

export default function KYCForm() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="max-w-lg w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Use a private screening link</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Tenant screening now starts with your landlord. Ask them to create a screening and send you its private link. You can review the purpose and give consent before sharing any information.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-[#0747a6] px-5 py-3 text-sm font-semibold text-white">
          Return to TenTrust
        </Link>
      </section>
    </main>
  );
}
