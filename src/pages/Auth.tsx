import React, { useState, useEffect } from 'react';
import { ShieldCheck, Building, User, ArrowRight, CheckCircle2, Lock, Mail, KeyRound, Sparkles, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [role, setRole] = useState<UserRole>('landlord');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const navigate = useNavigate();
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithMagicLink, loginAsDemo } = useAuth();

  useEffect(() => {
    if (user) {
      const searchParams = new URLSearchParams(window.location.search);
      const action = searchParams.get('action');
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'landlord') {
        if (action === 'verify') {
          navigate('/dashboard?tab=verify');
        } else {
          navigate('/dashboard');
        }
      } else {
        navigate('/tenant');
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (mode === 'signin') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setErrorMessage(error.message || 'Invalid email or password');
        }
      } else {
        if (!firstName || !lastName) {
          setErrorMessage('Please provide your full name.');
          setIsProcessing(false);
          return;
        }
        const { error } = await signUpWithEmail(email, password, { firstName, lastName, role });
        if (error) {
          setErrorMessage(error.message || 'Error creating account');
        } else {
          setSuccessMessage('Account created! Please check your email or sign in.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsProcessing(true);
    try {
      await signInWithGoogle(role);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || 'Google sign-in error. Using demo access.');
      await loginAsDemo(role);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setErrorMessage('Please enter your email to receive a magic sign-in link.');
      return;
    }
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const { error } = await signInWithMagicLink(email, role);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage('Magic sign-in link sent to your inbox!');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDemoSignIn = async (demoRole: UserRole) => {
    setIsProcessing(true);
    try {
      await loginAsDemo(demoRole);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Left side - Institutional Branding */}
      <div className="hidden md:flex flex-col justify-between w-5/12 p-12 text-white bg-[#0c2340] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 bg-blue-500/10"></div>

        <div className="relative z-10 w-full">
          <Link to="/" className="flex items-center gap-3 mb-16">
            <div className="bg-[#0747a6] p-2 rounded-xl text-white shadow-md">
              <ShieldCheck className="w-6 h-6 fill-current" />
            </div>
            <span className="font-heading font-black text-2xl tracking-tight text-white">
              TenTrust <span className="font-semibold text-slate-300">Platform</span>
            </span>
          </Link>

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/15 rounded-full text-xs font-bold uppercase tracking-wider text-blue-200 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" />
              Institutional Landlord &amp; Tenant Portal
            </div>
            
            <h1 className="text-4xl lg:text-5xl font-heading font-black leading-[1.1] text-white">
              Institutional-grade tenant intelligence.
            </h1>
            
            <p className="text-base text-slate-300 leading-relaxed max-w-md">
              Eliminate rental defaults with instant BVN/NIN screening, automated WhatsApp check links, and 100% payment guarantees.
            </p>

            <ul className="space-y-3.5 pt-4">
              {[
                'Instant BVN & NIN Identity Checks',
                '99.8% Tenancy Default Prediction Accuracy',
                'Automated WhatsApp & Web Invite Links',
                'Full Portfolio & Property Asset Management',
              ].map((benefit, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-slate-200 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-400 font-normal pt-12">
          &copy; {new Date().getFullYear()} TenTrust Africa. All rights reserved.
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 bg-white relative">
        <Link to="/" className="md:hidden flex items-center gap-2 mb-8 self-start">
          <div className="bg-[#0747a6] p-1.5 rounded-lg text-white">
            <ShieldCheck className="w-6 h-6 fill-current" />
          </div>
          <span className="font-heading font-black text-xl tracking-tight text-[#0c2340]">TenTrust</span>
        </Link>

        <div className="w-full max-w-md space-y-6">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-heading font-black text-slate-900">
              {mode === 'signin' ? 'Welcome Back' : 'Create Your Account'}
            </h2>
            <p className="text-sm text-slate-500">
              {mode === 'signin' ? 'Sign in to access your TenTrust portal' : 'Get started with instant tenant verification'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMessage(''); setSuccessMessage(''); }}
              className={`py-2.5 rounded-xl transition-all ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setErrorMessage(''); setSuccessMessage(''); }}
              className={`py-2.5 rounded-xl transition-all ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Role Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Role</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'landlord', label: 'Landlord' },
                { id: 'tenant', label: 'Tenant' },
                { id: 'admin', label: 'Admin' },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id as UserRole)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    role === r.id
                      ? 'bg-[#0c2340] text-white border-[#0c2340] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error / Success Feedback */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Oluwaseun"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0747a6]/20 focus:border-[#0747a6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Adebayo"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0747a6]/20 focus:border-[#0747a6]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0747a6]/20 focus:border-[#0747a6]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0747a6]/20 focus:border-[#0747a6]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 bg-[#0747a6] hover:bg-[#053680] text-white font-bold text-sm rounded-xl shadow-md shadow-[#0747a6]/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-75"
            >
              {isProcessing ? 'Processing...' : mode === 'signin' ? 'Sign In to Portal' : 'Create TenTrust Account'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Alternative Auth Dividers */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-xs font-semibold text-slate-400 uppercase">or</span>
            <div className="border-t border-slate-200 w-full"></div>
          </div>

          {/* Social / Magic Link / One-Click Access */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isProcessing}
              className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Continue with Google
            </button>

            {/* Instant Demo Quick Access */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-[11px] text-center font-bold uppercase tracking-wider text-slate-400">Instant Demo Access</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('landlord')}
                  className="py-2 px-2 bg-blue-50 hover:bg-blue-100 text-[#0747a6] text-xs font-bold rounded-xl transition-all text-center border border-blue-100"
                >
                  ⚡ Landlord
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('admin')}
                  className="py-2 px-2 bg-slate-900 hover:bg-black text-amber-300 text-xs font-bold rounded-xl transition-all text-center"
                >
                  👑 SuperAdmin
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('tenant')}
                  className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all text-center border border-slate-200"
                >
                  👤 Tenant
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
