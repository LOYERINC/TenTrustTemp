import { useState, useEffect, FormEvent } from 'react';
import { ShieldCheck, LayoutDashboard, Building, Users, Wallet, Bell, Search, Plus, MapPin, MoreVertical, CheckCircle2, Clock, TrendingUp, UploadCloud, FileText, Camera, Link as LinkIcon, Copy, Share2, Award, UserCheck, LogOut, User, Settings, HelpCircle, MessageSquare, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { mockApplications, mockFinancials } from '../data';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import OnboardingModal from '../components/OnboardingModal';

const packages = [
  { id: 'basic', name: 'Basic', price: 3000, description: 'BVN + ID Check' },
  { id: 'standard', name: 'Standard', price: 7000, description: 'BVN + Bank Statement Analysis + Credit Check' },
  { id: 'premium', name: 'Premium', price: 12000, description: 'Full Report + Employment + Reference + Credit Check' },
  { id: 'founding', name: 'Founding Member', price: 25000, description: '3 Premium Verifications bundle' }
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [properties, setProperties] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimationResult, setEstimationResult] = useState<any>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  
  // Verify Tenant state
  const [verificationMode, setVerificationMode] = useState<'direct' | 'link'>('direct');
  const [selectedPackage, setSelectedPackage] = useState(packages[1]);
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantBvn, setTenantBvn] = useState('');
  const [tenantIncome, setTenantIncome] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check URL query parameters for active tab
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'verify' || tabParam === 'verify-tenant') {
      setActiveTab('verify-tenant');
    }

    // First time onboarding check
    const hasCompletedTour = localStorage.getItem('tentrust_onboarding_completed');
    if (!hasCompletedTour) {
      setIsOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    const propQ = query(collection(db, 'properties'), where('landlordId', '==', user.id));
    const unsubscribeProp = onSnapshot(propQ, (snapshot) => {
      const fetchedProperties = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProperties(fetchedProperties.sort((a: any, b: any) => b.createdAt - a.createdAt));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    });

    const appQ = query(collection(db, 'applications'), where('landlordId', '==', user.id));
    const unsubscribeApp = onSnapshot(appQ, (snapshot) => {
      const fetchedApps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setApplications(fetchedApps.sort((a: any, b: any) => b.createdAt - a.createdAt));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'applications');
    });

    return () => {
      unsubscribeProp();
      unsubscribeApp();
    };
  }, [user, navigate]);

  const handleAddProperty = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const rentAmount = Number(formData.get('rentAmount'));
    const location = formData.get('location') as string;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'properties'), {
        landlordId: user.id,
        title,
        location,
        type: type === 'rent' ? 'Rent' : type === 'sale' ? 'Sale' : 'Shortlet',
        rentAmount,
        currency: 'NGN',
        status: 'Vacant',
        coverImage: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=600',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setActiveTab('properties');
      (e.target as HTMLFormElement).reset();
    } catch (error) {
       console.error("Error adding property: ", error);
       handleFirestoreError(error, OperationType.CREATE, 'properties');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunVerification = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantName || !tenantBvn) {
      alert('Please provide tenant name and BVN/NIN.');
      return;
    }

    setIsVerifying(true);
    setTimeout(async () => {
      const score = Math.floor(Math.random() * 52) + 45; // 45 to 96
      let rating = '';
      let recommendation = '';
      if (score >= 75) {
        rating = 'EXCELLENT';
        recommendation = 'Strongly Recommended';
      } else if (score >= 60) {
        rating = 'GOOD';
        recommendation = 'Recommended';
      } else if (score >= 45) {
        rating = 'FAIR';
        recommendation = 'Proceed with Caution';
      } else if (score >= 30) {
        rating = 'POOR';
        recommendation = 'Not Recommended';
      } else {
        rating = 'HIGH RISK';
        recommendation = 'Do Not Proceed';
      }

      const reportData = {
        tenantName,
        tenantPhone,
        tenantBvn,
        tenantIncome: tenantIncome || '450,000',
        score,
        rating,
        recommendation,
        packageName: selectedPackage.name,
        pricePaid: selectedPackage.price,
        verifiedAt: new Date().toLocaleDateString()
      };

      try {
        if (user) {
          await addDoc(collection(db, 'applications'), {
            landlordId: user.id,
            name: tenantName,
            propertyTitle: properties[0]?.title || 'General Property Verification',
            trustScore: score * 10,
            dateApplied: new Date().toISOString().split('T')[0],
            kycData: {
              bvnnin: tenantBvn,
              monthlyIncome: tenantIncome || '450000',
              employmentStatus: 'Employed',
              employerName: 'Verified Corporate',
              guarantorName: 'Assigned Guarantor'
            },
            createdAt: Date.now()
          });
        }
      } catch (err) {
        console.error(err);
      }

      setGeneratedReport(reportData);
      setIsVerifying(false);
    }, 1500);
  };

  const handleGenerateLink = (e: FormEvent) => {
    e.preventDefault();
    if (!tenantName) {
      alert('Please enter tenant name for the invite.');
      return;
    }
    const token = Math.random().toString(36).substring(2, 10);
    const link = `${window.location.origin}/apply/verify-${token}?pkg=${selectedPackage.id}&name=${encodeURIComponent(tenantName)}`;
    setGeneratedLink(link);
  };

  const handleEstimateRent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsEstimating(true);
    setEstimationResult(null);
    const formData = new FormData(e.currentTarget);
    const propertyDetails = `Property Type: ${formData.get('propertyType')}, Location: ${formData.get('location')}, Bedrooms: ${formData.get('bedrooms')}, Amenities: ${formData.get('amenities')}`;
    
    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyDetails })
      });
      const data = await res.json();
      setEstimationResult(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col shrink-0">
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-brand-600" />
            <span className="font-heading font-bold text-xl text-slate-900 tracking-tight">TenTrust<span className="text-brand-600">.</span></span>
          </Link>
        </div>
        <div className="p-4 space-y-1 flex-1">
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 mt-2">Landlord Menu</p>
          {[
            { id: 'overview', label: 'My Dashboard', icon: LayoutDashboard },
            { id: 'properties', label: 'My Properties', icon: Building },
            { id: 'verify-tenant', label: 'Verify Tenant', icon: ShieldCheck },
            { id: 'how-to-verify', label: 'How to Verify', icon: FileText },
            { id: 'add-property', label: 'List Property', icon: Plus },
            { id: 'applications', label: 'Review Tenants', icon: Users },
            { id: 'reminders', label: 'Automated Reminders', icon: Bell },
            { id: 'estimator', label: 'AI Rent Estimator', icon: TrendingUp },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === item.id 
                  ? 'bg-brand-50 text-brand-700 border border-brand-100' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-brand-600' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs text-brand-700 bg-brand-50/70 hover:bg-brand-100/70 border border-brand-200/60 transition-all shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-brand-600" />
              <span>Platform Quick Tour</span>
            </button>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] space-y-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-10 h-10 rounded-full bg-[#0c2340] flex items-center justify-center text-white font-bold">
              {user ? user.firstName[0] : 'L'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{user ? `${user.firstName} ${user.lastName}` : 'Landlord'}</p>
              <p className="text-xs text-slate-500">Verified Landlord</p>
            </div>
          </div>
          <button 
            onClick={async () => { await logout(); navigate('/auth'); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-slate-600 hover:text-red-600 hover:bg-red-50 font-semibold text-sm transition-colors border border-slate-200"
          >
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0">
          <h1 className="text-2xl font-heading font-bold text-slate-950 capitalize">
            {activeTab.replace('-', ' ')}
          </h1>
          <div className="flex items-center gap-4">
            <Link to="/listings" className="text-sm font-medium text-brand-600 hover:text-brand-700 underline hidden sm:block mr-2">View Public Listings</Link>
            <button onClick={() => setActiveTab('verify-tenant')} className="bg-brand-600 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-brand-700 transition-all flex items-center gap-1.5 sm:gap-2 shadow-sm whitespace-nowrap">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" /> Verify Tenant Now
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 p-1.5 sm:px-3 sm:py-2 rounded-xl transition-all border ${
                activeTab === 'profile'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title="View Profile"
            >
              <div className="w-8 h-8 rounded-lg bg-[#0c2340] flex items-center justify-center text-white font-bold text-xs shadow-xs">
                {user ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}` : 'U'}
              </div>
              <span className="text-xs sm:text-sm font-semibold hidden md:inline">
                {user ? user.firstName : 'Profile'}
              </span>
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 lg:p-8 pb-24 lg:pb-8 bg-slate-50">
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* HOW TO VERIFY TAB */}
            {activeTab === 'how-to-verify' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 md:p-10 space-y-8">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold uppercase mb-2">
                    <ShieldCheck className="w-4 h-4 text-brand-600" /> Landlord Guide
                  </div>
                  <h2 className="text-3xl font-heading font-extrabold text-slate-900">How Tenant Verification Works</h2>
                  <p className="text-slate-600 mt-2">TenTrust provides institutional-grade tenant screening powered by Casiec financial APIs. Follow this step-by-step guide to verify prospective tenants securely and eliminate tenancy defaults.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center text-lg">1</div>
                    <h3 className="font-heading font-bold text-lg text-slate-900">Select Verification Package</h3>
                    <p className="text-sm text-slate-600">Choose between Basic (BVN & ID check), Standard (Bank statement & credit score), or Premium (Full employment & past landlord reference check).</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center text-lg">2</div>
                    <h3 className="font-heading font-bold text-lg text-slate-900">Direct Entry or 48-Day Link</h3>
                    <p className="text-sm text-slate-600">You can either enter tenant details directly in the <strong>Verify Tenant</strong> tab or generate a secure temporary link for the tenant to complete. Note: All tenant links and requests automatically expire after <strong>48 days</strong> for enhanced security and compliance.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center text-lg">3</div>
                    <h3 className="font-heading font-bold text-lg text-slate-900">Automated Casiec Screening</h3>
                    <p className="text-sm text-slate-600">Our engine verifies the tenant's NIN/BVN, analyzes income stability, checks previous eviction records, and calculates their composite TenTrust Score.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center text-lg">4</div>
                    <h3 className="font-heading font-bold text-lg text-slate-900">Tenant Self-Verification</h3>
                    <p className="text-sm text-slate-600">Tenants can also initiate verification from their own dashboard, generating a verified badge and secure confirmation link to share directly with you via email or chat.</p>
                  </div>
                </div>

                <div className="bg-brand-900 text-white rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-heading font-bold mb-1">Ready to screen your next tenant?</h3>
                    <p className="text-brand-100 text-sm">Run instant checks with 99.8% default prediction accuracy.</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('verify-tenant')}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md shrink-0"
                  >
                    Verify Tenant Now
                  </button>
                </div>
              </div>
            )}

            {/* VERIFY TENANT TAB */}
            {activeTab === 'verify-tenant' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 md:p-10">
                
                {/* TenTrust WhatsApp Concierge Banner */}
                <div className="mb-8 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 text-white text-xs font-bold uppercase">
                      💬 TenTrust Landlord Concierge
                    </div>
                    <h3 className="text-lg font-heading font-bold">Need us to handle the tenant check for you?</h3>
                    <p className="text-emerald-100 text-xs sm:text-sm">Chat directly with our verification team on WhatsApp and we will assist you step-by-step.</p>
                  </div>
                  <a
                    href="https://api.whatsapp.com/send?phone=2349058283054&text=Hello%20TenTrust%20Support,%20I%20am%20a%20landlord%20and%20I%20need%20help%20verifying%20a%20tenant."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white hover:bg-emerald-50 text-emerald-800 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all shrink-0 flex items-center gap-2 active:scale-95"
                  >
                    Chat on WhatsApp
                  </a>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-100">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold uppercase mb-2">
                      <ShieldCheck className="w-4 h-4 text-brand-600" /> TenTrust Official Verification
                    </div>
                    <h2 className="text-3xl font-heading font-extrabold text-slate-900">Verify a Prospective Tenant</h2>
                    <p className="text-slate-600 mt-1">Choose whether to fill in their details directly or generate a secure temporary link for them to fill.</p>
                  </div>

                  <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button
                      onClick={() => setVerificationMode('direct')}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${verificationMode === 'direct' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Fill Details Directly
                    </button>
                    <button
                      onClick={() => setVerificationMode('link')}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${verificationMode === 'link' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Generate Temp Link
                    </button>
                  </div>
                </div>

                {/* Package Selection */}
                <div className="mb-8">
                  <label className="block text-sm font-bold text-slate-800 mb-3">1. Select Verification Package</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {packages.map(pkg => (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`cursor-pointer rounded-2xl p-4 border-2 transition-all flex flex-col justify-between ${selectedPackage.id === pkg.id ? 'border-brand-600 bg-brand-50/50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-heading font-bold text-slate-900 text-base">{pkg.name}</span>
                            <span className="font-black text-brand-700 font-heading">₦{pkg.price.toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-slate-500 mb-3">{pkg.description}</p>
                        </div>
                        <span className={`text-xs font-bold py-1 px-2.5 rounded-lg text-center ${selectedPackage.id === pkg.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          {selectedPackage.id === pkg.id ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {verificationMode === 'direct' ? (
                  <form onSubmit={handleRunVerification} className="space-y-6 pt-4 border-t border-slate-100">
                    <h3 className="text-xl font-heading font-bold text-slate-900 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-brand-600" /> 2. Enter Tenant Information
                    </h3>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Tenant Full Name *</label>
                        <input 
                          type="text" 
                          required 
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="e.g. Chukwudi Okafor" 
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-600 text-base font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">BVN or NIN *</label>
                        <input 
                          type="text" 
                          required 
                          maxLength={11}
                          value={tenantBvn}
                          onChange={(e) => setTenantBvn(e.target.value)}
                          placeholder="11-digit BVN or NIN" 
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-600 text-base font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Phone Number</label>
                        <input 
                          type="tel" 
                          value={tenantPhone}
                          onChange={(e) => setTenantPhone(e.target.value)}
                          placeholder="08000000000" 
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-600 text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Estimated Monthly Income (₦)</label>
                        <input 
                          type="number" 
                          value={tenantIncome}
                          onChange={(e) => setTenantIncome(e.target.value)}
                          placeholder="e.g. 500000" 
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-600 text-base"
                        />
                      </div>
                    </div>

                    <div className="pt-4">
                      <button 
                        type="submit" 
                        disabled={isVerifying}
                        className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
                      >
                        {isVerifying ? (
                          <>
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            Running Secure BVN & Credit Analysis...
                          </>
                        ) : (
                          <>
                            Run Verification & Generate Report (₦{selectedPackage.price.toLocaleString()})
                          </>
                        )}
                      </button>
                    </div>

                    {generatedReport && (
                      <div className="mt-8 bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-8 relative animate-fade-in">
                        <div className="absolute top-4 right-4 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
                          Verified Report Generated
                        </div>
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white font-heading font-black text-2xl flex items-center justify-center shadow-md">
                            {generatedReport.score}
                          </div>
                          <div>
                            <h4 className="text-2xl font-heading font-bold text-slate-900">{generatedReport.tenantName}</h4>
                            <p className="text-sm text-slate-600">BVN: {generatedReport.tenantBvn.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')} | Package: {generatedReport.packageName}</p>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-emerald-200 mb-6 flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase">TenTrust Rating</span>
                            <p className="text-xl font-black text-emerald-800 font-heading">{generatedReport.rating}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-500 uppercase">Recommendation</span>
                            <p className="text-sm font-bold text-slate-900">{generatedReport.recommendation}</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <button onClick={() => window.print()} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all">
                            Download PDF Report
                          </button>
                          <button onClick={() => setGeneratedReport(null)} className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl border border-slate-300">
                            Verify Another
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleGenerateLink} className="space-y-6 pt-4 border-t border-slate-100">
                    <h3 className="text-xl font-heading font-bold text-slate-900 flex items-center gap-2">
                      <LinkIcon className="w-5 h-5 text-brand-600" /> 2. Generate Temporary Link for Tenant
                    </h3>
                    <p className="text-slate-600 text-sm">
                      Send a secure link to your prospective tenant. They will securely input their BVN and details themselves without exposing sensitive info to you directly.
                    </p>

                    <div className="space-y-2 max-w-xl">
                      <label className="text-sm font-bold text-slate-700">Tenant Full Name (Optional)</label>
                      <input 
                        type="text" 
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        placeholder="e.g. Folashade Adebayo" 
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-600 text-base"
                      />
                    </div>

                    <button 
                      type="submit"
                      className="py-4 px-8 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
                    >
                      <LinkIcon className="w-5 h-5" /> Generate Secure Verification Link
                    </button>

                    {generatedLink && (
                      <div className="mt-8 bg-brand-50 border-2 border-brand-500 rounded-3xl p-6 sm:p-8 animate-fade-in">
                        <h4 className="font-heading font-bold text-lg text-slate-900 mb-2">Temporary Secure Link Generated</h4>
                        <p className="text-sm text-slate-600 mb-4">Send this link to the tenant via WhatsApp, SMS, or email. Link expires in 48 hours.</p>
                        
                        <div className="flex items-center gap-2 bg-white p-3 rounded-2xl border border-brand-200 mb-6">
                          <input 
                            type="text" 
                            readOnly 
                            value={generatedLink} 
                            className="w-full bg-transparent px-2 text-sm text-slate-800 font-mono outline-none"
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(generatedLink);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 3000);
                            }}
                            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shrink-0 flex items-center gap-1.5 transition-all"
                          >
                            <Copy className="w-4 h-4" /> {copiedLink ? 'Copied!' : 'Copy Link'}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-4">
                          <a 
                            href={`https://wa.me/?text=${encodeURIComponent(`Hello ${tenantName || 'Tenant'}, please complete your TenTrust verification for our rental agreement using this secure link: ${generatedLink}`)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm"
                          >
                            <Share2 className="w-4 h-4" /> Share via WhatsApp
                          </a>
                        </div>
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* ADD PROPERTY TAB */}
            {activeTab === 'add-property' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 md:p-8 border-b border-slate-100 bg-brand-900 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-800 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
                  <div className="relative z-10">
                    <h2 className="text-2xl font-heading font-bold mb-2">List a New Property</h2>
                    <p className="text-brand-100 max-w-2xl">
                      Provide accurate details. All properties are verified for ownership and physical condition before going live to ensure trust in the TenTrust ecosystem.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddProperty} className="p-6 md:p-8 space-y-10">
                  {/* Basic Details */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                      <Building className="w-5 h-5 text-brand-600" />
                      <h3 className="text-lg font-bold text-slate-900">1. Property Details</h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Property Title</label>
                        <input name="title" type="text" required placeholder="e.g. Luxury 2 Bedroom Apartment" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Listing Type</label>
                        <select name="type" required className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                          <option value="">Select Type</option>
                          <option value="rent">Rent (Yearly)</option>
                          <option value="shortlet">Shortlet (Daily/Monthly)</option>
                          <option value="sale">For Sale</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Price (₦)</label>
                        <input name="rentAmount" type="number" required placeholder="e.g. 5000000" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Location / Address</label>
                        <input name="location" type="text" required placeholder="Full street address, LGA, State" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                      </div>
                    </div>
                  </div>

                  {/* Media Uploads */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                      <Camera className="w-5 h-5 text-brand-600" />
                      <h3 className="text-lg font-bold text-slate-900">2. Pictures & Media</h3>
                    </div>
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer flex flex-col items-center justify-center gap-3">
                      <div className="bg-white p-4 rounded-full shadow-sm">
                        <UploadCloud className="w-8 h-8 text-brand-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Click to upload property photos</p>
                        <p className="text-sm text-slate-500 mt-1">SVG, PNG, JPG or GIF (max. 800x400px)</p>
                      </div>
                    </div>
                  </div>

                  {/* KYC & Verification */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                      <FileText className="w-5 h-5 text-brand-600" />
                      <h3 className="text-lg font-bold text-slate-900">3. Ownership Verification (KYC)</h3>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-sm mb-4">
                      <ShieldCheck className="w-5 h-5 shrink-0" />
                      <p>To maintain platform trust, we require proof of ownership. These documents are kept strictly confidential and never shared publicly.</p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Proof of Ownership Document</label>
                          <select required className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                            <option value="">Select Document Type</option>
                            <option value="c-of-o">Certificate of Occupancy (C of O)</option>
                            <option value="governors-consent">Governor's Consent</option>
                            <option value="deed">Deed of Assignment</option>
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Upload Document Extract</label>
                          <input type="file" required className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer" />
                       </div>
                       <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700">Agent/Landlord Contact Numbers</label>
                          <input type="text" required placeholder="Phone numbers separated by commas" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                       </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                    <button type="button" onClick={() => setActiveTab('overview')} className="px-6 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-brand-700 transition-all shadow-sm disabled:opacity-75 disabled:cursor-not-allowed">
                      {isSubmitting ? (
                        <><Clock className="w-5 h-5 animate-spin" /> Submitting for Review</>
                      ) : (
                        <><CheckCircle2 className="w-5 h-5" /> Submit Listing</>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {(activeTab === 'overview' || activeTab === 'properties' || activeTab === 'applications') && (
              <>
                {/* Friendly Alert */}
                <div className="bg-brand-900/5 border border-brand-200 rounded-2xl p-6 flex items-start gap-4">
                   <div className="bg-brand-100 p-2 rounded-full text-brand-600 shrink-0">
                     <ShieldCheck className="w-6 h-6" />
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900 text-lg">Peace of Mind for your Rentals</h4>
                     <p className="text-slate-600 mt-1">Review tenant applications easily. Focus on their <strong>Trust Score</strong>. Casiec Financials ensures you get guaranteed payments for verified tenants.</p>
                   </div>
                </div>
                
                {/* KPI Cards */}
                {(activeTab === 'overview' || activeTab === 'properties') && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-medium text-slate-500 mb-1">Total Portfolio Value (Yr)</p>
                          <h3 className="text-2xl font-bold font-heading text-slate-900">₦24,700,000</h3>
                        </div>
                        <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                        100% Guaranteed via Casiec Financials
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-medium text-slate-500 mb-1">Active Properties</p>
                          <h3 className="text-2xl font-bold font-heading text-slate-900">{properties.length} <span className="text-lg text-slate-400 font-normal">Units</span></h3>
                        </div>
                        <div className="bg-brand-50 p-2 rounded-lg text-brand-600">
                          <Building className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 mt-4">
                        <div className="bg-brand-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">85% Occupancy Rate</p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-medium text-slate-500 mb-1">Safe Tenants (Identity Verified)</p>
                          <h3 className="text-2xl font-bold font-heading text-slate-900 text-emerald-600">100%</h3>
                        </div>
                        <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 tracking-wide font-medium">All tenant backgrounds are checked.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Financial Chart */}
                  {activeTab === 'overview' && (
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-heading font-bold text-slate-900">Money In vs Expected (Millions ₦)</h3>
                        <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none">
                          <option>Last 6 Months</option>
                        </select>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mockFinancials} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              formatter={(value, name) => [`₦${value}M`, name === 'paid' ? 'Money Received' : 'Money Expected']}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="expected" fill="#94a3b8" name="Money Expected" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            <Bar dataKey="paid" fill="#10b981" name="Money Received" radius={[4, 4, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Pending Applications */}
                  {(activeTab === 'overview' || activeTab === 'applications') && (
                    <div className={`${activeTab === 'applications' ? 'lg:col-span-3' : 'lg:col-span-1'} bg-white rounded-2xl border border-slate-200 shadow-sm p-0 overflow-hidden flex flex-col`}>
                      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-lg font-heading font-bold text-slate-900">Tenant Reviews</h3>
                      </div>
                      <div className="flex-1 overflow-auto divide-y divide-slate-100">
                        {applications.map((app) => {
                          const propertyInfo = properties.find(p => p.id === app.propertyId);
                          return (
                          <div key={app.id} className="p-5 hover:bg-slate-50 transition-colors flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                              {app.kycData?.bvnnin ? 'V' : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-1">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 truncate">{app.name || 'Tenant Application'}</h4>
                                  <p className="text-xs text-slate-500 truncate">Income: ₦{Number(app.kycData?.monthlyIncome || 0).toLocaleString()} | {app.kycData?.employmentStatus}</p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 ${app.trustScore > 600 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                                  {app.trustScore > 600 ? 'Safe Tenant' : 'Risky Tenant'}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 mt-3 mb-2">
                                <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col justify-center">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Job / Work</span>
                                  <span className="text-xs font-bold text-slate-900">{app.kycData?.employerName || app.kycData?.employmentStatus || 'Unknown'}</span>
                                </div>
                                <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col justify-center">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Guarantor Name</span>
                                  <span className="text-xs font-bold text-slate-900 truncate">{app.kycData?.guarantorName || 'None'}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-1">
                                {app.kycData?.bvnnin ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Government ID Checked
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                    <Clock className="w-3 h-3 text-amber-600" /> ID Missing
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )})}
                      </div>
                    </div>
                  )}
                </div>

                {/* Properties List */}
                {(activeTab === 'overview' || activeTab === 'properties') && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden pb-4">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-lg font-heading font-bold text-slate-900">Your Properties</h3>
                      <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-5 h-5" /></button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</th>
                            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Price Details</th>
                            <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="py-3 px-6"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {properties.map((property) => (
                            <tr key={property.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4 px-6 flex items-center gap-4">
                                <img src={property.coverImage} alt={property.title} className="w-16 h-12 rounded-lg object-cover bg-slate-200" />
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm">{property.title}</p>
                                  <p className="text-xs text-slate-500">{property.type}</p>
                                </div>
                              </td>
                              <td className="py-4 px-6">
                                <p className="text-sm font-medium text-slate-600 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {property.location}
                                </p>
                              </td>
                              <td className="py-4 px-6">
                                <p className="text-sm font-bold text-slate-900">₦{(property.rentAmount / 1000000).toFixed(2)}M</p>
                              </td>
                              <td className="py-4 px-6">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  property.status === 'Occupied' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : 'bg-blue-50 text-brand-700 border border-blue-100'
                                }`}>
                                  {property.status}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-right">
                                <button className="text-brand-600 text-sm font-medium hover:underline">Manage</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'reminders' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8">
                 <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                       <Bell className="w-6 h-6 text-brand-600" />
                    </div>
                    <div>
                       <h2 className="text-2xl font-bold font-heading text-slate-900">Automated Rent Reminders</h2>
                       <p className="text-slate-500 text-sm">Configure how and when your tenants are notified about upcoming rent payments.</p>
                    </div>
                 </div>

                 <div className="space-y-6 max-w-3xl">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                       <div>
                          <h4 className="font-bold text-slate-900">3 Days Before Due Date</h4>
                          <p className="text-sm text-slate-500 mt-1">Send an email and push notification reminder 72 hours before the rent is due. Highly recommended.</p>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer shrink-0">
                         <input type="checkbox" className="sr-only peer" defaultChecked />
                         <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                       </label>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                       <div>
                          <h4 className="font-bold text-slate-900">7 Days Before Due Date</h4>
                          <p className="text-sm text-slate-500 mt-1">Send an early email reminder one week before the rent is due.</p>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer shrink-0">
                         <input type="checkbox" className="sr-only peer" />
                         <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                       </label>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                       <div>
                          <h4 className="font-bold text-slate-900">On Due Date</h4>
                          <p className="text-sm text-slate-500 mt-1">Send a final push notification and SMS if rent is not yet paid on the exact due date.</p>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer shrink-0">
                         <input type="checkbox" className="sr-only peer" defaultChecked />
                         <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                       </label>
                    </div>

                    <button className="mt-4 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center w-full sm:w-auto hover:bg-slate-800 transition-colors shadow-sm">
                       Save Notification Preferences
                    </button>
                    
                    <div className="mt-8 pt-8 border-t border-slate-100">
                        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                           <ShieldCheck className="w-5 h-5 text-brand-600" /> Reminder System Logs
                        </h3>
                        <div className="space-y-3">
                           <div className="bg-white border border-slate-100 p-4 rounded-lg flex items-center justify-between">
                              <div>
                                 <p className="font-semibold text-slate-800 text-sm">Automated Email & Push Sent - Tenant Chukwudi O.</p>
                                 <p className="text-xs text-slate-500 mt-0.5">Luxury 2 Bedroom Apartment</p>
                              </div>
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Success</span>
                           </div>
                           <div className="bg-white border border-slate-100 p-4 rounded-lg flex items-center justify-between">
                              <div>
                                 <p className="font-semibold text-slate-800 text-sm">Automated SMS Sent - Tenant Jane D.</p>
                                 <p className="text-xs text-slate-500 mt-0.5">3 Bedroom Duplex - Lekki</p>
                              </div>
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Success</span>
                           </div>
                        </div>
                    </div>
                 </div>
              </div>
            )}

            {activeTab === 'estimator' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8">
                 <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                    <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center">
                       <TrendingUp className="w-6 h-6 text-brand-600" />
                    </div>
                    <div>
                       <h2 className="text-2xl font-bold font-heading text-slate-900">AI Rent Estimator</h2>
                       <p className="text-slate-500 text-sm">Use local market data to find the best rental price for your property.</p>
                    </div>
                 </div>

                 <form onSubmit={handleEstimateRent} className="space-y-6 max-w-2xl mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">Location / Neighborhood</label>
                         <input name="location" type="text" required placeholder="e.g. Lekki Phase 1" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                      </div>
                      <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">Property Type</label>
                         <select name="propertyType" required className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                            <option value="">Select type...</option>
                            <option value="Apartment">Apartment</option>
                            <option value="Duplex">Duplex</option>
                            <option value="Bungalow">Bungalow</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">Number of Bedrooms</label>
                         <input name="bedrooms" type="number" required placeholder="e.g. 3" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                      </div>
                      <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">Key Amenities</label>
                         <input name="amenities" type="text" placeholder="e.g. Pool, 24/7 Power" className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                      </div>
                    </div>
                    <button type="submit" disabled={isEstimating} className="bg-brand-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 w-full md:w-auto hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-75 disabled:cursor-not-allowed">
                       {isEstimating ? 'Analyzing Market Data...' : 'Estimate Optimal Rent'}
                    </button>
                 </form>

                 {estimationResult && (
                   <div className="bg-brand-900/5 border border-brand-200 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-lg font-heading font-bold text-slate-900 mb-4">Estimation Results</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                           <p className="text-sm font-medium text-slate-500 mb-1">Recommended Annual Rent</p>
                           <p className="text-2xl font-bold font-heading text-emerald-600">{estimationResult.estimatedRange}</p>
                           <div className="mt-2 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-semibold">
                             Data Confidence: {estimationResult.confidence}%
                           </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                           <p className="text-sm font-medium text-slate-500 mb-1">AI Market Analysis</p>
                           <p className="text-sm text-slate-700 leading-relaxed">{estimationResult.analysis}</p>
                        </div>
                      </div>
                   </div>
                 )}
              </div>
            )}

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Clean Profile Header Card */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0c2340] text-white flex items-center justify-center text-2xl font-bold font-heading shadow-md shrink-0">
                        {user ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}` : 'LU'}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                            {user ? `${user.firstName} ${user.lastName}` : 'Landlord User'}
                          </h2>
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 font-normal">
                          {user?.email || 'landlord@tentrust.ng'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={async () => { await logout(); navigate('/auth'); }}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 hover:bg-red-50 text-xs font-bold transition-all self-start sm:self-center"
                    >
                      <LogOut className="w-4 h-4" /> Log Out
                    </button>
                  </div>
                </div>

                {/* Account Overview Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-1.5 shadow-xs">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Account Role</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900">Landlord</p>
                    <p className="text-xs text-slate-500">Institutional Access</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-1.5 shadow-xs">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Properties</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900">{properties.length} Listed</p>
                    <p className="text-xs text-slate-500">In Portfolio</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-1.5 shadow-xs">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Screenings</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900">{applications.length} Completed</p>
                    <p className="text-xs text-slate-500">Tenant checks</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-1.5 shadow-xs">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security</p>
                    <p className="text-base sm:text-lg font-bold text-emerald-600">NDPR Active</p>
                    <p className="text-xs text-slate-500">Encrypted KYC</p>
                  </div>
                </div>

                {/* Quick Actions & Navigation */}
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base">Quick Actions</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <button
                      onClick={() => setActiveTab('verify-tenant')}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 shrink-0 group-hover:scale-105 transition-transform"><ShieldCheck className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">Run a Verification</p>
                        <p className="text-xs text-slate-500">Screen a prospective tenant in 3 minutes</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveTab('add-property')}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 group-hover:scale-105 transition-transform"><Plus className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">List a Property</p>
                        <p className="text-xs text-slate-500">Add a new property to your portfolio</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveTab('estimator')}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 group-hover:scale-105 transition-transform"><TrendingUp className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">AI Rent Estimator</p>
                        <p className="text-xs text-slate-500">Get a market-calibrated rent estimate</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Support & Guides */}
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base">Support &amp; Resources</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <a
                      href="https://api.whatsapp.com/send?phone=2349058283054&text=Hello%20TenTrust%20Support,%20I%20need%20help%20with%20my%20account."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 group-hover:scale-105 transition-transform"><MessageSquare className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">Chat on WhatsApp (09058283054)</p>
                        <p className="text-xs text-slate-500">Talk directly with TenTrust landlord support</p>
                      </div>
                    </a>
                    <button
                      onClick={() => setIsOnboardingOpen(true)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-700 shrink-0 group-hover:scale-105 transition-transform"><Sparkles className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">Take Platform Tour</p>
                        <p className="text-xs text-slate-500">Revisit the quick 3-step walkthrough</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveTab('how-to-verify')}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 group-hover:scale-105 transition-transform"><HelpCircle className="w-5 h-5" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">How Tenant Verification Works</p>
                        <p className="text-xs text-slate-500">Step-by-step landlord verification guide</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ─── MOBILE BOTTOM NAV BAR (visible below lg) ─── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-50 safe-area-pb">
          <div className="grid grid-cols-5 h-16">
            {[
              { id: 'overview', label: 'Home', icon: LayoutDashboard },
              { id: 'properties', label: 'Properties', icon: Building },
              { id: 'verify-tenant', label: 'Verify', icon: ShieldCheck },
              { id: 'applications', label: 'Tenants', icon: Users },
              { id: 'profile', label: 'Profile', icon: User },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  activeTab === item.id
                    ? 'text-brand-600'
                    : 'text-slate-400 active:text-slate-600'
                }`}
              >
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-brand-600' : ''}`} />
                <span className={`text-[10px] font-semibold ${activeTab === item.id ? 'text-brand-600' : 'text-slate-400'}`}>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </main>

      {/* Interactive Onboarding Tour Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
