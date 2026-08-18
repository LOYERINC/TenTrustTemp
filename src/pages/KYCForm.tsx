import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, getDoc, doc } from 'firebase/firestore';
import { ShieldCheck, ArrowRight, ArrowLeft, CheckCircle2, Lock, LogIn } from 'lucide-react';
import { mockProperties } from '../data';

export default function KYCForm() {
  const { propertyId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [property, setProperty] = useState<any>({
    title: 'TenTrust Rental Property Screening',
    location: 'Verified Rental Address',
    rentAmount: 250000
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    async function fetchProperty() {
      if (!propertyId) return;
      try {
        const propDoc = await getDoc(doc(db, 'properties', propertyId));
        if (propDoc.exists()) {
          setProperty(propDoc.data());
        } else {
          // Fallback to mock data if it's a seed property
          const mockProp = mockProperties.find(p => p.id === propertyId);
          if (mockProp) setProperty(mockProp);
        }
      } catch (error) {
        console.error('Error loading property details:', error);
        const mockProp = mockProperties.find(p => p.id === propertyId);
        if (mockProp) setProperty(mockProp);
      }
    }
    fetchProperty();
  }, [propertyId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const kycData = {
      fullName: formData.get('fullName') as string,
      phone: formData.get('phone') as string,
      maritalStatus: formData.get('maritalStatus') as string,
      currentAddress: formData.get('currentAddress') as string,
      employmentStatus: formData.get('employmentStatus') as string,
      employerName: formData.get('employerName') as string,
      monthlyIncome: Number(formData.get('monthlyIncome')),
      bvnnin: formData.get('bvnnin') as string,
      nextOfKinName: formData.get('nextOfKinName') as string,
      nextOfKinPhone: formData.get('nextOfKinPhone') as string,
      guarantorName: formData.get('guarantorName') as string,
      guarantorPhone: formData.get('guarantorPhone') as string,
      previousLandlord: formData.get('previousLandlord') as string
    };

    setIsSubmitting(true);
    try {
      if (propertyId) {
        await addDoc(collection(db, 'applications'), {
          propertyId,
          tenantId: user?.id || 'guest-tenant',
          landlordId: property?.landlordId || 'landlord-1',
          status: 'pending',
          trustScore: Math.floor(Math.random() * 400) + 500,
          kycData,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    } catch (error) {
       console.error("Error submitting KYC", error);
    } finally {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center space-y-6 animate-fadeIn">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-black text-slate-900">
              Verification Submitted!
            </h1>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your tenant screening application for <strong>{property?.title}</strong> has been submitted successfully to your landlord.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 text-left space-y-2">
            <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#0747a6]" /> What happens next?
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">
              Your landlord will review your verification report. You can log in to your TenTrust account to track application status and view your verified trust score.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <Link
              to="/auth"
              className="w-full py-3.5 px-6 rounded-2xl bg-[#0747a6] hover:bg-[#053680] text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In to View Dashboard
            </Link>
            <Link
              to="/"
              className="block text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors font-medium text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-[#0c2340] p-8 text-white relative flex justify-between items-center overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/2"></div>
             <div className="relative z-10">
                <h1 className="text-2xl font-bold font-heading mb-2">Tenant KYC &amp; Verification</h1>
                <p className="text-blue-200 text-sm">Applying for: <strong>{property?.title}</strong></p>
             </div>
             <ShieldCheck className="w-12 h-12 text-blue-400 relative z-10" />
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Full Name</label>
                  <input name="fullName" type="text" required placeholder="e.g. Alex Morgan" defaultValue={user ? (user.firstName + ' ' + user.lastName) : ''} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Phone Number</label>
                  <input name="phone" type="tel" required placeholder="08012345678" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Marital Status</label>
                  <select name="maritalStatus" required className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium">
                     <option value="">Select status</option>
                     <option value="Single">Single</option>
                     <option value="Married">Married</option>
                     <option value="Divorced">Divorced</option>
                     <option value="Widowed">Widowed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Current Address</label>
                  <input name="currentAddress" type="text" required placeholder="House number, Street, City" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Employment &amp; Financial Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Employment Status</label>
                  <select name="employmentStatus" required className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium">
                     <option value="">Select status</option>
                     <option value="Employed">Employed (Full-time)</option>
                     <option value="Self-Employed">Self-Employed</option>
                     <option value="Business Owner">Business Owner</option>
                     <option value="Unemployed">Unemployed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Employer / Business Name</label>
                  <input name="employerName" type="text" placeholder="Company XYZ" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Monthly Income (₦)</label>
                  <input name="monthlyIncome" type="number" required placeholder="e.g. 500000" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-sm" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
               <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Identity &amp; Background</h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">BVN or NIN</label>
                    <input name="bvnnin" type="text" required placeholder="11-digit verification number" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Previous Landlord Contact (Optional)</label>
                    <input name="previousLandlord" type="text" placeholder="Landlord Name & Phone" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                  </div>
               </div>
            </div>

            <div className="space-y-4">
               <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Emergency Contacts &amp; Guarantor</h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Next of Kin Full Name</label>
                    <input name="nextOfKinName" type="text" required placeholder="Jane Doe" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Next of Kin Phone</label>
                    <input name="nextOfKinPhone" type="tel" required placeholder="08023456789" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Guarantor Full Name</label>
                    <input name="guarantorName" type="text" required placeholder="Mr. Smith" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Guarantor Phone</label>
                    <input name="guarantorPhone" type="tel" required placeholder="08034567890" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium" />
                  </div>
               </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full py-4 mt-8 rounded-2xl text-white font-bold flex justify-center items-center gap-2 transition-all shadow-md bg-[#0747a6] hover:bg-[#053680] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed">
              {isSubmitting ? 'Verifying & Submitting...' : 'Submit Verification Form'} <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-center text-slate-500 mt-4">
              By submitting this form, you consent to TenTrust verifying your identity and creditworthiness.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
