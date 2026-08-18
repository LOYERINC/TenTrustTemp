import { MessageSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function AIChatbot() {
  const location = useLocation();
  
  // Hide the floating button on the chat page itself
  if (location.pathname === '/chat') {
    return null;
  }

  return (
    <Link 
      to="/chat"
      className="fixed bottom-24 lg:bottom-6 right-6 w-16 h-16 rounded-full shadow-2xl transition-all z-50 hover:scale-105 block"
    >
      <div className="relative w-full h-full group">
        <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-max opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-900 text-sm font-bold px-3 py-2 rounded-lg shadow-lg border border-slate-100 pointer-events-none z-10">
          Chat with TenTrust AI
          <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-white transform rotate-45 border-t border-r border-slate-100"></div>
        </div>
        <img 
          src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&q=80&w=300" 
          alt="TenTrust AI Representative" 
          className="w-full h-full rounded-full object-cover border-4 border-white shadow-lg"
        />
        <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center animate-pulse"></div>
        <div className="absolute -bottom-1 -left-1 bg-brand-600 text-white p-1.5 rounded-full border-2 border-white shadow-sm">
          <MessageSquare className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}

