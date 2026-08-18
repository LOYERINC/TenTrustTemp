import React, { useState, useEffect } from 'react';
import { ShieldCheck, Building, MessageSquare, TrendingUp, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
}

export default function OnboardingModal({ isOpen, onClose, onNavigateTab }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const steps = [
    {
      title: "Welcome to TenTrust",
      badge: "Landlord Quick Tour (1/3)",
      icon: ShieldCheck,
      headline: "AI-Powered Tenant Screening & Portfolio Management",
      description: "Screen prospective tenants, eliminate tenancy defaults, and manage your properties with institutional-grade verification in just a few clicks.",
      features: [
        "Predict tenancy risk with 99.8% accuracy",
        "Instant BVN, NIN, employment & credit checks",
        "Automated WhatsApp & link screening invites"
      ],
      actionLabel: "Next: How to Screen Tenants",
      secondaryAction: null
    },
    {
      title: "Screen Prospective Tenants",
      badge: "Verification Engine (2/3)",
      icon: MessageSquare,
      headline: "Two flexible ways to verify in under 3 minutes",
      description: "Choose direct entry or generate a secure WhatsApp / Web link for prospective tenants to self-verify on their phones.",
      features: [
        "Direct Screening: Enter tenant's details to get an instant Score (0–100)",
        "WhatsApp Invite: Send a secure link directly to their phone",
        "Select packages: Basic (₦3k), Standard (₦7k), or Premium (₦12k)"
      ],
      actionLabel: "Next: AI Tools & Portfolio",
      secondaryAction: "Try Verify Flow"
    },
    {
      title: "AI Rent Estimator & Portfolio",
      badge: "Maximize Your Yield (3/3)",
      icon: Sparkles,
      headline: "Put your properties on auto-pilot with AI",
      description: "List all your properties, track tenant applications, and use our AI Rent Estimator to find the optimal rental price based on current market trends.",
      features: [
        "AI Rent Estimator: Instant rent pricing & data confidence rating",
        "Property Portfolio: Track vacancies, rent collections, and applications",
        "24/7 AI Assistant & WhatsApp Concierge support"
      ],
      actionLabel: "Get Started Now",
      secondaryAction: "Explore Properties"
    }
  ];

  const step = steps[currentStep];
  const StepIcon = step.icon;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      localStorage.setItem('tentrust_onboarding_completed', 'true');
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(curr => curr - 1);
    }
  };

  const handleSecondary = () => {
    localStorage.setItem('tentrust_onboarding_completed', 'true');
    onClose();
    if (currentStep === 1) {
      onNavigateTab('verify-tenant');
    } else if (currentStep === 2) {
      onNavigateTab('properties');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden relative transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={() => {
            localStorage.setItem('tentrust_onboarding_completed', 'true');
            onClose();
          }}
          aria-label="Close tour"
          className="absolute top-5 right-5 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header Banner */}
        <div className="bg-[#0c2340] p-6 pt-8 text-white relative overflow-hidden border-b border-white/10">
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 pointer-events-none">
            <StepIcon className="w-40 h-40 text-white" />
          </div>

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-blue-100 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              {step.badge}
            </div>
            <h2 className="text-2xl font-heading font-black text-white leading-tight">
              {step.title}
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 font-medium">
              {step.headline}
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 space-y-5">
          <p className="text-sm text-slate-600 leading-relaxed font-normal">
            {step.description}
          </p>

          {/* Bulleted Key Features */}
          <div className="space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            {step.features.map((feat, index) => (
              <div key={index} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* Progress Indicators & Navigation */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            {/* Step Dots */}
            <div className="flex items-center gap-2">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  aria-label={`Go to step ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    currentStep === idx 
                      ? 'w-6 bg-brand-600' 
                      : 'w-2 bg-slate-200 hover:bg-slate-300'
                  }`}
                />
              ))}
            </div>

            {/* Back / Next Buttons */}
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}

              {step.secondaryAction && (
                <button
                  onClick={handleSecondary}
                  className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  {step.secondaryAction}
                </button>
              )}

              <button
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                {step.actionLabel}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
