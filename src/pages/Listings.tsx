import { ShieldCheck, MapPin, Search, Filter, Plus } from '../lib/icons';
import { Link, useNavigate } from 'react-router-dom';
import { mockProperties } from '../data';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function Listings() {
  const [filter, setFilter] = useState('All');
  const [properties, setProperties] = useState<any[]>(mockProperties);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'properties'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const fetchedProperties = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProperties([...fetchedProperties, ...mockProperties]);
      } else {
        setProperties(mockProperties);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    });

    return () => unsubscribe();
  }, []);

  const handleListPropertyClick = () => {
    if (user && user.role === 'landlord') {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  const filteredProperties = filter === 'All' 
    ? properties 
    : properties.filter(p => p.type === filter);

  return (
    <div className="min-h-screen font-sans bg-slate-50">
      {/* Navigation */}
      <nav className="site-listings-nav bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-brand-600" />
            <span className="font-heading font-bold text-2xl text-slate-900 tracking-tight">TenTrust<span className="text-brand-600">.</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <button onClick={handleListPropertyClick} className="hidden sm:flex text-sm font-bold items-center gap-2 text-brand-700 bg-brand-50 hover:bg-brand-100 hover:text-brand-800 px-4 py-2 rounded-full transition-colors">
              <Plus className="w-4 h-4" /> Add a home
            </button>
            {user ? (
              <Link to={user.role === 'landlord' ? "/dashboard" : "/tenant"} className="text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 px-5 py-2 rounded-full transition-colors">My account</Link>
            ) : (
              <Link to="/auth" className="text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 px-5 py-2 rounded-full bg-slate-50 transition-colors">Sign In / Register</Link>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold text-slate-900">Find a home</h1>
            <p className="text-slate-600 mt-2">Browse homes shared by landlords.</p>
          </div>
          <div className="flex bg-white shadow-sm border border-slate-200 rounded-full p-1">
            {['All', 'Rent', 'Shortlet', 'Sale'].map(tab => (
              <button 
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${filter === tab ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProperties.map(property => (
            <Link to={`/apply/${property.id}`} key={property.id} className="group bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all">
              <div className="relative h-64 overflow-hidden">
                <img src={property.coverImage} alt={property.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-slate-900 uppercase tracking-wide">
                  {property.type}
                </div>
                <div className="absolute top-4 right-4 bg-brand-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Checked by TenTrust
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-heading font-bold text-lg text-slate-900 mb-1 line-clamp-1">{property.title}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1 mb-4">
                  <MapPin className="w-4 h-4" /> {property.location}
                </p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-0.5">{property.type === 'Rent' ? 'Each year' : property.type === 'Shortlet' ? 'Each night' : 'Price'}</p>
                    <p className="font-heading font-bold text-brand-600 text-xl">₦{Number(property.rentAmount || 0).toLocaleString()}</p>
                  </div>
                  <button className="text-sm font-bold text-white bg-brand-600 px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors">View home</button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
