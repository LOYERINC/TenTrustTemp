import { useState, useEffect } from 'react';
import { ShieldCheck, User, Building, CreditCard, ChevronRight, CheckCircle2, AlertCircle, Clock, Info, LogOut } from '../lib/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import { mockProperties } from '../data';

export default function TenantDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [properties, setProperties] = useState<Record<string, any>>({});
  
  const [showScreeningNotice, setShowScreeningNotice] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const appQ = query(collection(db, 'applications'), where('tenantId', '==', user.id));
    const unsubscribe = onSnapshot(appQ, async (snapshot) => {
      const fetchedApps: any[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setApplications(fetchedApps.sort((a, b) => b.createdAt - a.createdAt));

      // Fetch distinct property info
      const propsData: Record<string, any> = {};
      for (const app of fetchedApps) {
        if (!propsData[app.propertyId]) {
          const pDoc = await getDoc(doc(db, 'properties', app.propertyId));
          if (pDoc.exists()) {
            propsData[app.propertyId] = pDoc.data();
          } else {
            const mockP = mockProperties.find(p => p.id === app.propertyId);
            if (mockP) propsData[app.propertyId] = mockP;
          }
        }
      }
      setProperties(prev => ({...prev, ...propsData}));
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, 'applications');
    });

    return () => unsubscribe();
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-brand-600" />
          <span className="font-heading font-bold text-2xl text-slate-900 tracking-tight">TenTrust<span className="text-brand-600">.</span></span>
        </Link>
        <div className="flex items-center gap-4">
           <Link to="/listings" className="text-sm font-medium text-brand-600 hover:underline mr-4 hidden sm:block">Find a home</Link>
           <div className="flex items-center gap-3 border border-slate-200 px-3 py-1.5 rounded-full bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold uppercase">{user.firstName[0]}</div>
              <span className="text-sm font-bold text-slate-900">{user.firstName} {user.lastName.charAt(0)}.</span>
           </div>
           <button 
             onClick={async () => { await logout(); navigate('/auth'); }}
             title="Log Out"
             className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center gap-2 text-sm font-semibold"
           >
             <LogOut className="w-4 h-4" /> <span className="hidden md:inline">Log Out</span>
           </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 lg:p-10 space-y-8">
        
        {/* Welcome & Score */}
        <div className="brand-banner-art text-white rounded-3xl p-8 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-800 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xl">
              <h1 className="text-3xl font-heading font-bold mb-2">Welcome back, {user.firstName}!</h1>
              <p className="text-brand-100">See your rental checks and any home requests here.</p>
              
              <div className="mt-6 flex flex-wrap gap-3">
                <button 
                  onClick={() => setShowScreeningNotice(true)}
                  className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" /> How a tenant check works
                </button>
              </div>
            </div>
            
            <div className="text-center bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 min-w-[200px]">
              <p className="text-brand-100 text-sm font-medium mb-1">Tenant check score</p>
              <p className="text-5xl font-bold font-heading text-white">—</p>
              <div className="mt-3 inline-flex items-center gap-1 bg-white/10 text-blue-100 px-2 py-1 rounded-full text-xs font-semibold">A score shows here after your landlord sends a check</div>
            </div>
          </div>
        </div>

        {applications.length > 0 && (
           <div className="bg-red-50 border border-red-100 text-red-900 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse-slow">
             <div className="flex items-start gap-4">
               <div className="bg-red-100 p-2 rounded-full text-red-600 shrink-0">
                 <AlertCircle className="w-6 h-6" />
               </div>
               <div>
                 <h3 className="font-heading font-bold text-lg mb-1">Rent is due soon</h3>
                 <p className="text-red-700 text-sm">Rent for <strong>{properties[applications[0].propertyId]?.title || 'your home'}</strong> is due in 3 days. Pay your landlord on time.</p>
               </div>
             </div>
             <button className="whitespace-nowrap bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm">
               Pay rent
             </button>
           </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Tenant check information */}
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative">
            <div className="absolute top-8 right-8 text-slate-200">
               <ShieldCheck className="w-12 h-12" />
            </div>
            <h2 className="text-xl font-heading font-bold text-slate-900 mb-6">Your tenant check</h2>
            <div className="space-y-6">
              
              <div className="flex gap-4">
                <div className="mt-1"><CheckCircle2 className={`w-6 h-6 ${applications.length > 0 ? 'text-emerald-500' : 'text-slate-300'}`} /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">Your details</h3>
                  <p className="text-sm text-slate-600 mt-1">{applications.length > 0 ? 'Your landlord has a home request from you.' : 'Your landlord will send you a private link if they need to check your details.'}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="mt-1"><AlertCircle className="w-6 h-6 text-emerald-500" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">Rent history</h3>
                  <p className="text-sm text-slate-600 mt-1">Any rent history shared for a check will appear in its report.</p>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <div className="mt-1"><CreditCard className="w-6 h-6 text-brand-600" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">Help with rent</h3>
                  <p className="text-sm text-slate-600 mt-1 mb-3">Learn about rent payment options from Casiec Financials.</p>
                  <a href="https://casiecfinancials.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-4 py-2 rounded-lg transition-colors">
                    Visit Casiec <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Applications */}
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col p-8">
            <h2 className="text-xl font-heading font-bold text-slate-900 mb-6">Your home requests and checks</h2>
            {applications.length === 0 ? (
               <div className="text-center py-12">
                 <p className="text-slate-500 mb-4">You have no home requests yet.</p>
                  <button onClick={() => setShowScreeningNotice(true)} className="text-brand-600 font-bold hover:underline">How a tenant check works</button>
               </div>
            ) : (
               <div className="space-y-4 flex-1 overflow-y-auto">
                 {applications.map(app => {
                    const property = properties[app.propertyId];
                    return (
                      <div key={app.id} className="border border-slate-100 rounded-xl p-4 flex gap-4">
                         {property?.coverImage ? <img src={property.coverImage} className="w-20 h-20 rounded-lg object-cover" alt="Property" /> : <div className="w-20 h-20 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 font-bold">TV</div>}
                         <div className="flex-1">
                           <h3 className="font-bold text-slate-900">{property?.title || app.propertyTitle || 'Self-Verification Profile'}</h3>
                            <p className="text-sm text-slate-500 mb-2">Your check score shows here when the check is done.</p>
                           <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                             app.status === 'approved' || app.status === 'verified_self' ? 'bg-emerald-50 text-emerald-700' :
                             app.status === 'rejected' ? 'bg-red-50 text-red-700' :
                             'bg-amber-50 text-amber-700'
                           }`}>
                             <CheckCircle2 className="w-3 h-3" />
                             {app.status === 'verified_self' ? 'Self-Verified & Shared' : (app.status.charAt(0).toUpperCase() + app.status.slice(1))}
                           </span>
                         </div>
                      </div>
                    )
                 })}
               </div>
            )}
          </div>
        </div>
      </main>

      {showScreeningNotice && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-2 text-slate-900"><Info className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-bold">How a tenant check works</h2></div><p className="text-sm leading-6 text-slate-600">Your landlord starts the check and sends you a private link. You add the details and say yes before they are used.</p><button onClick={() => setShowScreeningNotice(false)} className="w-full rounded-xl bg-blue-800 px-4 py-3 text-sm font-bold text-white">Close</button></div></div>}
    </div>
  );
}


function TrendingUpIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
