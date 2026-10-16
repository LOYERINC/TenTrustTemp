import React, { useState, useEffect } from 'react';
import { User, ArrowRight, CheckCircle2, Lock, Mail, Sparkles, AlertCircle, Eye, EyeSlash } from '../lib/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { Logo } from '../components/mvp-ui';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [role, setRole] = useState<UserRole>('landlord');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        if (error) setErrorMessage(error.message || 'Invalid email or password');
      } else {
        if (!firstName || !lastName) {
          setErrorMessage('Please provide your full name.');
          setIsProcessing(false);
          return;
        }
        const { error, requiresEmailConfirmation } = await signUpWithEmail(email, password, { firstName, lastName, role });
        if (error) setErrorMessage(error.message || 'Error creating account');
        else if (requiresEmailConfirmation) setSuccessMessage('Account created. Check your email to confirm it, then sign in to continue.');
        else setSuccessMessage('Account created! Please check your email or sign in.');
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
      setErrorMessage(error.message || 'Google sign-in could not be started. Please use email and password.');
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
      if (error) setErrorMessage(error.message);
      else setSuccessMessage('Magic sign-in link sent to your inbox!');
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

  const emailFieldError = errorMessage && !email.trim() && errorMessage.toLowerCase().includes('email') ? errorMessage : '';
  const passwordFieldError = errorMessage && mode === 'signin' && !password && /password/i.test(errorMessage) ? errorMessage : '';
  const firstNameFieldError = errorMessage.includes('full name') && !firstName ? 'Enter your first name.' : '';
  const lastNameFieldError = errorMessage.includes('full name') && !lastName ? 'Enter your last name.' : '';

  return (
    <main className="tt-auth-v2">
      <aside className="tt-auth-brand-panel" aria-label="About TenTrust">
        <div className="tt-auth-brand-inner">
          <Link to="/" className="tt-auth-wordmark" aria-label="TenTrust home"><Logo inverse/></Link>
          <div className="tt-auth-brand-copy">
            <span className="tt-auth-audience"><Sparkles size={14}/> For landlords and tenants</span>
            <h1>A clearer start to renting.</h1>
            <p><span className="tt-auth-desktop-copy">Check a tenant with their consent and move forward with more confidence.</span><span className="tt-auth-mobile-copy">Clearer renting starts with trust.</span></p>
            <ul>
              {['Ask for consent before the check', 'Keep ID numbers private', 'Share a secure tenant link', 'Review a clear identity result'].map((benefit) => <li key={benefit}><CheckCircle2 size={19} weight="fill"/><span>{benefit}</span></li>)}
            </ul>
          </div>
        </div>
        <p className="tt-auth-brand-footer">© {new Date().getFullYear()} TenTrust. Renting, with more clarity.</p>
      </aside>

      <section className="tt-auth-form-panel" aria-labelledby="auth-heading">
        <div className="tt-auth-mobile-brand"><Link to="/" aria-label="TenTrust home"><Logo/></Link><p>A clearer start to renting, for everyone.</p></div>
        <div className="tt-auth-form-wrap">
          <header className="tt-auth-heading">
            <p className="tt-auth-overline">WELCOME TO TENTRUST</p>
            <h2 id="auth-heading">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{mode === 'signin' ? 'Sign in to continue to your account.' : 'Get started with a clearer rental journey.'}</p>
          </header>

          <div className="tt-auth-segment" aria-label="Account access">
            <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'is-active' : ''} onClick={() => { setMode('signin'); setErrorMessage(''); setSuccessMessage(''); }}>Sign in</button>
            <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setErrorMessage(''); setSuccessMessage(''); }}>Create account</button>
          </div>

          <fieldset className="tt-auth-role-group">
            <legend>I’m joining as a</legend>
            <div className="tt-auth-role-options">
              {([{ id: 'landlord', label: 'Landlord' }, { id: 'tenant', label: 'Tenant' }, { id: 'admin', label: 'Admin' }] as const).map((item) => <label className="tt-auth-role-pill" key={item.id}>
                <input type="radio" name="account-role" value={item.id} checked={role === item.id} onChange={() => setRole(item.id as UserRole)} />
                <span>{item.label}</span>
              </label>)}
            </div>
          </fieldset>

          {errorMessage && <div className="tt-auth-alert tt-auth-alert-error" role="alert" aria-live="polite"><AlertCircle size={19}/><span>{errorMessage}</span></div>}
          {successMessage && <div className="tt-auth-alert tt-auth-alert-success" role="status" aria-live="polite"><CheckCircle2 size={19}/><span>{successMessage}</span></div>}

          <form onSubmit={handleSubmit} className="tt-auth-fields">
            {mode === 'signup' && <div className="tt-auth-name-row">
              <div className="tt-auth-field"><label htmlFor="auth-first-name">First name</label><input id="auth-first-name" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Chidinma" aria-invalid={Boolean(firstNameFieldError)} aria-describedby={firstNameFieldError ? 'first-name-error' : undefined}/>{firstNameFieldError && <small id="first-name-error" className="tt-auth-field-error">{firstNameFieldError}</small>}</div>
              <div className="tt-auth-field"><label htmlFor="auth-last-name">Last name</label><input id="auth-last-name" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Okafor" aria-invalid={Boolean(lastNameFieldError)} aria-describedby={lastNameFieldError ? 'last-name-error' : undefined}/>{lastNameFieldError && <small id="last-name-error" className="tt-auth-field-error">{lastNameFieldError}</small>}</div>
            </div>}
            <div className="tt-auth-field"><label htmlFor="auth-email">Email address</label><span className="tt-auth-input-wrap"><Mail size={18} aria-hidden="true"/><input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(emailFieldError)} aria-describedby={emailFieldError ? 'email-error' : undefined}/></span>{emailFieldError && <small id="email-error" className="tt-auth-field-error">{emailFieldError}</small>}</div>
            <div className="tt-auth-field"><label htmlFor="auth-password">Password</label><span className="tt-auth-input-wrap"><Lock size={18} aria-hidden="true"/><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" aria-invalid={Boolean(passwordFieldError)} aria-describedby={passwordFieldError ? 'password-error' : undefined}/><button className="tt-auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeSlash size={19}/> : <Eye size={19}/>}</button></span>{passwordFieldError && <small id="password-error" className="tt-auth-field-error">{passwordFieldError}</small>}</div>
            {mode === 'signin' && <div className="tt-auth-forgot-row"><button type="button" onClick={handleMagicLink} disabled={isProcessing}>Forgot password?</button></div>}
            <button type="submit" disabled={isProcessing} className="tt-auth-submit"><span className={isProcessing ? 'tt-auth-spinner' : 'tt-auth-submit-icon'} aria-hidden="true">{isProcessing ? '' : <ArrowRight size={19}/>}</span>{isProcessing ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          </form>

          <div className="tt-auth-divider"><span>or</span></div>
          <button type="button" onClick={handleGoogleSignIn} disabled={isProcessing} className="tt-auth-google">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            Continue with Google
          </button>
          <p className="tt-auth-legal">By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>

          {!isSupabaseConfigured() && <section className="tt-auth-demo" aria-label="Demo accounts"><p>Explore a demo account</p><div>
            <button type="button" onClick={() => handleDemoSignIn('landlord')} disabled={isProcessing}><User size={16}/>Landlord demo</button>
            <button type="button" onClick={() => handleDemoSignIn('admin')} disabled={isProcessing}>Admin demo</button>
            <button type="button" onClick={() => handleDemoSignIn('tenant')} disabled={isProcessing}>Tenant demo</button>
          </div></section>}
        </div>
      </section>
    </main>
  );
}
