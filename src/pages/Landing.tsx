import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ShieldCheck, ArrowRight, Play, Clock, Lock, Phone, Mail, MapPin, CheckCircle, Instagram, ChevronDown, MessageSquare, Sparkles, Send } from 'lucide-react';
import TenTrustVerifySection from '../components/TenTrustVerifySection';
import ComingSoonSection from '../components/ComingSoonSection';
import heroLaptop from '../assets/tentrust.png';
import mobileImg from '../assets/tentrust.png';

export default function Landing() {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen font-sans bg-[#f7f9fc] text-slate-900 overflow-x-hidden selection:bg-[#0747a6] selection:text-white">
      
      {/* Hero Section - full-bleed laptop background */}
      <div className="relative border-b border-slate-200/80 overflow-hidden">
        {/* Background image */}
        <img
          src={heroLaptop}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Gradient overlay: solid white on left → transparent on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/10 pointer-events-none" />
        
        {/* Navigation */}
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-20 relative">
          <div className="flex items-center gap-3">
            <div className="bg-[#0747a6] p-2 rounded-xl text-white shadow-md">
              <Shield className="w-6 h-6 fill-current stroke-none" />
            </div>
            <span className="font-heading font-black text-2xl text-[#0c2340] tracking-tight">
              TenTrust <span className="font-semibold text-slate-700">Platform</span>
            </span>
          </div>
          
          {/* Desktop nav links — hidden below md */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-700">
            <a href="#verify" className="hover:text-[#0747a6] transition-colors">TenTrust Verify</a>
            <a href="#how-it-works" className="hover:text-[#0747a6] transition-colors">How It Works</a>
            <a href="#roadmap" className="hover:text-[#0747a6] transition-colors">Coming Soon</a>
            <Link to="/chat" className="text-emerald-700 hover:text-emerald-800 flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-200/80 transition-all shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              AI Assistant
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Check Tenant Button — desktop */}
            <Link 
              to="/auth?action=verify" 
              className="hidden md:inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4 fill-current" />
              Check Tenant
            </Link>

            {/* Sign In — desktop only */}
            <Link to="/auth" className="hidden md:inline-flex text-sm font-bold text-slate-800 hover:text-[#0747a6] px-5 py-2.5 rounded-full border border-slate-300 hover:border-[#0747a6] transition-all bg-white shadow-xs">
              Sign In
            </Link>
            {/* Hamburger — mobile only */}
            <button
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setNavOpen(o => !o)}
              className="md:hidden p-2 rounded-lg text-[#0c2340] hover:bg-slate-100/80 transition-colors"
            >
              {navOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                </svg>
              )}
            </button>
          </div>
        </nav>

        {/* Mobile nav drawer */}
        {navOpen && (
          <div className="md:hidden absolute top-20 inset-x-0 z-50 bg-white border-b border-slate-200 shadow-xl">
            <div className="px-5 py-6 flex flex-col gap-2">
              <Link
                to="/auth?action=verify"
                onClick={() => setNavOpen(false)}
                className="py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#20bd5a] flex items-center gap-2 shadow-xs transition-colors"
              >
                <MessageSquare className="w-4 h-4 fill-current" />
                Check Tenant (Login &amp; Verify)
              </Link>
              <a
                href="#verify"
                onClick={() => setNavOpen(false)}
                className="py-3 px-4 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0747a6] transition-colors"
              >
                TenTrust Verify
              </a>
              <a
                href="#how-it-works"
                onClick={() => setNavOpen(false)}
                className="py-3 px-4 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0747a6] transition-colors"
              >
                How It Works
              </a>
              <a
                href="#roadmap"
                onClick={() => setNavOpen(false)}
                className="py-3 px-4 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0747a6] transition-colors"
              >
                Coming Soon
              </a>
              <Link
                to="/chat"
                onClick={() => setNavOpen(false)}
                className="py-3 px-4 rounded-xl text-sm font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                AI Assistant
              </Link>
              <div className="mt-2 pt-4 border-t border-slate-100">
                <Link
                  to="/auth"
                  onClick={() => setNavOpen(false)}
                  className="block w-full text-center py-3 px-4 rounded-xl bg-[#0747a6] text-white font-bold text-sm hover:bg-[#053680] transition-colors"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ─── MOBILE HERO (hidden on md+) ─── */}
        <section className="md:hidden px-5 pt-4 pb-10 relative z-10">
          {/* White background for mobile — no background image bleed */}
          <div className="absolute inset-0 bg-white" />

          <div className="relative z-10 space-y-6">
            {/* Headline */}
            <h1 className="text-[2.15rem] font-heading font-black text-[#0c2340] leading-[1.1] tracking-tight">
              Know Your Tenant<br />Before You Hand Over<br />the Keys.
            </h1>

            {/* Body */}
            <p className="text-[0.95rem] text-slate-600 leading-relaxed">
              TenTrust is the AI-native intelligence platform built for institutional property managers and real estate professionals.
            </p>

            {/* WhatsApp Hero Banner Card */}
            <div className="bg-gradient-to-r from-emerald-600 to-[#128C7E] rounded-2xl p-4 text-white shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full w-fit">
                <Sparkles className="w-3.5 h-3.5" />
                Need help checking a tenant?
              </div>
              <p className="text-xs text-emerald-50 leading-relaxed font-medium">
                Chat directly with our TenTrust Support Concierge on WhatsApp! We help landlords set up automated tenant checks in minutes.
              </p>
              <a
                href="https://api.whatsapp.com/send?phone=2349058283054&text=Hello%20TenTrust%20Support,%20I%20am%20a%20landlord%20and%20I%20need%20help%20checking%20my%20tenant."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-white text-emerald-800 hover:bg-emerald-50 w-full py-3 rounded-xl font-bold text-xs transition-all shadow-xs"
              >
                <MessageSquare className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                Chat with TenTrust Support on WhatsApp
              </a>
            </div>

            {/* Stacked full-width buttons */}
            <div className="flex flex-col gap-3">
              <Link
                to="/auth?action=verify"
                className="flex items-center justify-center gap-2 bg-[#0747a6] hover:bg-[#053680] text-white w-full py-4 rounded-2xl font-bold text-base transition-all shadow-md shadow-[#0747a6]/20 active:scale-[0.98]"
              >
                Check Tenant Now <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 text-slate-800 w-full py-4 rounded-2xl font-bold text-base border border-slate-200 transition-all active:scale-[0.98]"
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                  <Play className="w-3 h-3 text-slate-700 fill-slate-700 ml-0.5" />
                </div>
                Watch Demo
              </a>
            </div>

            {/* Mobile dashboard image */}
            <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200">
              <img
                src={mobileImg}
                alt="TenTrust Platform Dashboard"
                className="w-full h-auto object-cover"
              />
            </div>

            {/* Feature list — icon + bold title + description (horizontal rows) */}
            <div className="space-y-5 pt-2">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-11 h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0747a6]">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Accurate Reports</h4>
                  <p className="text-xs text-slate-500 leading-snug mt-0.5">Reliable, up-to-date information you can trust.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-11 h-11 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Faster Decisions</h4>
                  <p className="text-xs text-slate-500 leading-snug mt-0.5">Automated checks save you time and effort.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-11 h-11 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Secure &amp; Compliant</h4>
                  <p className="text-xs text-slate-500 leading-snug mt-0.5">Your data is protected and privacy-focused.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── DESKTOP / TABLET HERO (hidden on mobile) ─── */}
        <section className="hidden md:block max-w-7xl mx-auto px-6 pt-10 pb-28">
          <div className="grid grid-cols-12 gap-12 items-center">
            <div className="col-span-6 space-y-8 z-10 relative">
              <h1 className="text-6xl font-heading font-black text-[#0c2340] leading-[1.08] tracking-tight">
                Know Your Tenant<br />
                <span className="text-[#0c2340]">Before You Hand Over the Keys.</span>
              </h1>
              <p className="text-lg text-slate-600 font-normal leading-relaxed max-w-lg">
                TenTrust is the AI-native intelligence platform built for institutional property managers and real estate professionals.
              </p>

              {/* WhatsApp Hero Banner Card — Desktop */}
              <div className="bg-gradient-to-r from-emerald-600 via-[#128C7E] to-[#075E54] rounded-2xl p-5 text-white shadow-xl max-w-lg relative overflow-hidden group">
                <div className="absolute right-3 -bottom-4 opacity-15 pointer-events-none group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-32 h-32 fill-current text-white" />
                </div>
                <div className="space-y-3 relative z-10">
                  <div className="flex items-center gap-2 text-xs font-bold bg-white/20 px-3 py-1 rounded-full w-fit backdrop-blur-md">
                    <Sparkles className="w-3.5 h-3.5" />
                    Need help checking a tenant?
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-50 leading-relaxed font-medium">
                    Connect directly with our TenTrust Concierge on WhatsApp! We assist landlords with full screening, document verification, and tenant links.
                  </p>
                  <div className="pt-1 flex items-center gap-3">
                    <a
                      href="https://api.whatsapp.com/send?phone=2349058283054&text=Hello%20TenTrust%20Support,%20I%20am%20a%20landlord%20and%20I%20need%20help%20checking%20my%20tenant."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-white text-emerald-900 hover:bg-emerald-50 px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98]"
                    >
                      <MessageSquare className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                      Chat with TenTrust Support on WhatsApp
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a href="#verify" className="inline-flex items-center gap-2.5 bg-[#0747a6] hover:bg-[#053680] text-white px-7 py-3.5 rounded-xl font-bold text-base transition-all shadow-md shadow-[#0747a6]/20 active:scale-[0.98]">
                  Get Started <ArrowRight className="w-4 h-4" />
                </a>
                <a href="#how-it-works" className="inline-flex items-center gap-2.5 bg-white hover:bg-slate-50 text-slate-800 px-6 py-3.5 rounded-xl font-bold text-base border border-slate-200 transition-all shadow-xs active:scale-[0.98]">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                    <Play className="w-3 h-3 text-slate-700 fill-slate-700 ml-0.5" />
                  </div>
                  Watch Demo
                </a>
              </div>
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-200/60">
                <div className="space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0747a6] mb-2"><Shield className="w-5 h-5" /></div>
                  <h4 className="font-bold text-slate-900 text-sm">Accurate Reports</h4>
                  <p className="text-xs text-slate-500 leading-snug">Reliable, up-to-date information you can trust.</p>
                </div>
                <div className="space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-2"><Clock className="w-5 h-5" /></div>
                  <h4 className="font-bold text-slate-900 text-sm">Faster Decisions</h4>
                  <p className="text-xs text-slate-500 leading-snug">Automated checks save you time and effort.</p>
                </div>
                <div className="space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 mb-2"><Lock className="w-5 h-5" /></div>
                  <h4 className="font-bold text-slate-900 text-sm">Secure &amp; Compliant</h4>
                  <p className="text-xs text-slate-500 leading-snug">Your data is protected and privacy-focused.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* TenTrust Verify Core Section */}
      <TenTrustVerifySection />

      {/* How It Works - Bento Grid */}
      <section id="how-it-works" className="py-24 px-6 bg-white border-y border-slate-200/80 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-heading font-black text-slate-900 tracking-tight">
              How TenTrust Verify Works
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              Three simple steps designed for absolute clarity and speed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Step 1 */}
            <div className="glass-card p-8 rounded-3xl flex flex-col justify-between group relative overflow-hidden transition-all duration-300 hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl group-hover:bg-brand-500/10 transition-colors" />
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#0747a6] text-white font-heading font-black text-xl flex items-center justify-center mb-6 shadow-md">
                  1
                </div>
                <h3 className="text-xl font-heading font-bold text-slate-900 mb-2">Select Package</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Choose from Basic (₦3k), Standard (₦7k), or Premium (₦12k) depending on screening depth.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0747a6]">
                <span>Instant Processing</span>
                <CheckCircle className="w-4 h-4 text-[#0747a6]" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="glass-card p-8 rounded-3xl flex flex-col justify-between group relative overflow-hidden transition-all duration-300 hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
              <div>
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-heading font-black text-xl flex items-center justify-center mb-6 shadow-md">
                  2
                </div>
                <h3 className="text-xl font-heading font-bold text-slate-900 mb-2">Enter Details</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Input the prospective tenant's full name, BVN/NIN, and phone number into our secure portal.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>NDPR Compliant</span>
                <CheckCircle className="w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="glass-card p-8 rounded-3xl flex flex-col justify-between group relative overflow-hidden bg-gradient-to-b from-emerald-50/30 to-white border-emerald-200/60 transition-all duration-300 hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-heading font-black text-xl flex items-center justify-center mb-6 shadow-md shadow-emerald-600/20">
                  3
                </div>
                <h3 className="text-xl font-heading font-bold text-slate-900 mb-2">Get Score & Report</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Instantly view the TenTrust Score (0–100) and actionable recommendation (Excellent to High Risk).
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-emerald-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Make Confident Decisions</span>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Coming Soon Roadmap Section */}
      <div id="roadmap">
        <ComingSoonSection />
      </div>

      {/* Footer - GoCanopy Inspired High-End Design */}
      <footer className="bg-[#142027] text-slate-300 pt-16 pb-8 px-6 sm:px-12 border-t border-slate-800/80 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          
          {/* Top Row: Info Left, Navigation & CTA Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start mb-16">
            
            {/* Left Column: Description & LinkedIn Button */}
            <div className="lg:col-span-5 space-y-12">
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-sm font-normal">
                TenTrust is the AI-native intelligence platform built for institutional property managers and real estate professionals.
              </p>

              {/* Instagram Pill Button */}
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 group transition-transform active:scale-95"
              >
                <div className="w-8 h-8 rounded-full bg-white text-[#142027] flex items-center justify-center shadow-md group-hover:bg-gradient-to-tr group-hover:from-amber-500 group-hover:via-rose-500 group-hover:to-purple-600 group-hover:text-white transition-all">
                  <Instagram className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                  Follow us on Instagram
                </span>
              </a>
            </div>

            {/* Right Column: Nav Links & Action Pill */}
            <div className="lg:col-span-7 space-y-10">
              
              {/* Nav Link Columns */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
                <div>
                  <h4 className="font-semibold text-slate-100 text-sm mb-4">TenTrust</h4>
                  <ul className="space-y-3 text-slate-400 font-normal">
                    <li><a href="#" className="hover:text-white transition-colors">Home</a></li>
                    <li><a href="#verify" className="hover:text-white transition-colors">Product</a></li>
                    <li>
                      <a href="#how-it-works" className="hover:text-white transition-colors inline-flex items-center gap-1">
                        Solutions <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                      </a>
                    </li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-100 text-sm mb-4">Company</h4>
                  <ul className="space-y-3 text-slate-400 font-normal">
                    <li><a href="#how-it-works" className="hover:text-white transition-colors">About</a></li>
                    <li><Link to="/chat" className="hover:text-white transition-colors">AI Assistant</Link></li>
                    <li><Link to="/auth" className="hover:text-white transition-colors">Sign In</Link></li>
                  </ul>
                </div>
              </div>

              {/* Action Banner Pill */}
              <div className="space-y-2 pt-2">
                <div className="border border-[#2dd4bf]/40 bg-[#1b2b34]/90 rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 shadow-lg backdrop-blur-md">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                      <Shield className="w-4 h-4 text-[#2dd4bf]" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-slate-200 truncate">
                      Ready to See TenTrust in Action?
                    </span>
                  </div>

                  <a 
                    href="#verify"
                    className="bg-[#2dd4bf] hover:bg-[#22b8a5] text-[#0f181d] text-xs sm:text-sm font-bold px-4 sm:px-5 py-2 rounded-full transition-all flex items-center gap-1.5 shrink-0 shadow-md active:scale-95 whitespace-nowrap"
                  >
                    Book a Demo <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Sub-pill Monospace Taglines */}
                <div className="flex items-center justify-start px-4 text-[10px] sm:text-xs font-mono tracking-widest text-slate-400/70 uppercase">
                  <span>INTELLIGENCE THAT COMPOUNDS</span>
                </div>
              </div>

            </div>

          </div>

          {/* Huge Brand Typography */}
          <div className="py-4 sm:py-8 my-4 text-center border-t border-b border-slate-800/40 overflow-hidden">
            <h1 className="font-serif text-[15vw] sm:text-[14vw] lg:text-[12rem] leading-none tracking-tight text-white/95 font-normal select-none pointer-events-none">
              TenTrust
            </h1>
          </div>

          {/* Bottom Bar: Copyright & Links */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400/80 gap-4 font-normal">
            <div>
              &copy; {new Date().getFullYear()} TenTrust. All rights reserved.
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-200 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-200 transition-colors">Terms of Service</a>
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}


