import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from '../lib/icons';

export default function TenTrustVerifySection() {
  return (
    <section id="verify" className="bg-slate-50 px-4 py-20 font-sans sm:px-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm md:p-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-800">
          <ShieldCheck className="h-4 w-4" /> Tenant screening
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Check a tenant before you rent out your home</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">Pick a plan and pay. Then send your tenant a private link. They can add their details and give consent there.</p>
        <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-800 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-900">
          Sign in to start a check <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-xs text-slate-500">The score can help you review an application. It does not make the choice for you.</p>
      </div>
    </section>
  );
}
