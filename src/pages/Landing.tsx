import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Building2, CheckCircle2, IdentificationCard, Lock, MapPin, Phone, Users, ShieldCheck, User as UserRound, ArrowRight, X } from '../lib/icons';
import { Container, Logo } from '../components/mvp-ui';
import SampleReportCard from '../components/SampleReportCard';
import LandingPricingTiers from '../components/LandingPricingTiers';
import { siteConfig } from '../config';
import { tiers as configuredTiers } from '../config/pricing.js';
import { landingReportChecks, type LandingReportCheck, type ReportCheckIcon } from '../config/landing-report-checks';
import { screeningApi, type ScreeningPackage } from '../lib/screeningApi';
import { formatNaira } from '../utils/format.js';

const reportIconByType: Record<ReportCheckIcon, typeof IdentificationCard> = {
  'id-card': IdentificationCard,
  phone: Phone,
  briefcase: Briefcase,
  'map-pin': MapPin,
  people: Users,
};

const verificationSteps = [
  { number: '01', title: 'Enter tenant details', description: 'Add the tenant and property information for a check.', icon: <IdentificationCard aria-hidden="true"/> },
  { number: '02', title: 'Tenant gives consent', description: 'The tenant reviews the request and agrees before checks begin.', icon: <UserRound aria-hidden="true"/> },
  { number: '03', title: 'Get a verified result', description: 'Review the completed report in your TenTrust dashboard.', icon: <CheckCircle2 aria-hidden="true"/> },
];

function Heading({ eyebrow, title, children, centered = false }: { eyebrow: string; title: string; children?: React.ReactNode; centered?: boolean }) {
  return <div className={`tt-section-heading${centered ? ' is-centered' : ''}`}>
    <p className="tt-eyebrow">{eyebrow}</p>
    <h2>{title}</h2>
    {children && <p className="tt-section-lede">{children}</p>}
  </div>;
}

function orderPackages(packages: ScreeningPackage[]) {
  const order: Record<string, number> = { standard: 0, identity: 1, basic: 2, premium: 3, founding: 4 };
  return [...packages].sort((a, b) => (order[a.id] ?? 10) - (order[b.id] ?? 10));
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingUnavailable, setPricingUnavailable] = useState(false);
  const [screeningPackages, setScreeningPackages] = useState<ScreeningPackage[]>([]);
  const [heroPassed, setHeroPassed] = useState(false);
  const [footerNear, setFooterNear] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const reportDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    screeningApi<{ packages: ScreeningPackage[] }>('/api/screenings/packages', {}, false)
      .then((result) => { if (active) setScreeningPackages(orderPackages(result.packages ?? [])); })
      .catch(() => { if (active) setPricingUnavailable(true); })
      .finally(() => { if (active) setPricingLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    const footer = footerRef.current;
    if (!hero || !footer || !('IntersectionObserver' in window)) return;
    const heroObserver = new IntersectionObserver(([entry]) => setHeroPassed(!entry.isIntersecting), { threshold: 0.01 });
    const footerObserver = new IntersectionObserver(([entry]) => setFooterNear(entry.isIntersecting), { rootMargin: '0px 0px 120px 0px', threshold: 0.01 });
    heroObserver.observe(hero);
    footerObserver.observe(footer);
    return () => { heroObserver.disconnect(); footerObserver.disconnect(); };
  }, []);

  useEffect(() => {
    const dialog = reportDialogRef.current;
    if (!dialog) return;
    if (sampleOpen && !dialog.open) dialog.showModal();
    else if (!sampleOpen && dialog.open) dialog.close();
  }, [sampleOpen]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = document.querySelectorAll<HTMLElement>('.tt-v2-section, .tt-proof-strip, .tt-v2-closing');
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    targets.forEach((el) => el.classList.add('tt-reveal-pending'));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('tt-revealed'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const proofs = [...siteConfig.launchProof.filter(Boolean), ...(siteConfig.cacNumber ? [`CAC registered: ${siteConfig.cacNumber}`] : [])];
  const availablePackages = screeningPackages;
  const configuredIdentityPrice = configuredTiers.find((tier) => tier.id === 'identity')?.price ?? configuredTiers[0]?.price;
  const identityPackage = availablePackages.find((tier) => tier.id === 'identity' && tier.enabled);
  const heroPricePackage = identityPackage ?? availablePackages.filter((tier) => tier.enabled).sort((a, b) => a.price - b.price)[0];
  const heroPrice = heroPricePackage?.price;
  const canUseConfiguredPrice = heroPrice != null && heroPrice === configuredIdentityPrice;
  const priceLabel = heroPrice == null ? null : formatNaira(canUseConfiguredPrice ? configuredIdentityPrice : heroPrice);
  const sampleChecks = landingReportChecks.filter((check) => check.live);
  const priceConfigOutdated = identityPackage != null && configuredIdentityPrice != null && identityPackage.price !== configuredIdentityPrice;
  const showStickyCta = heroPassed && !footerNear;

  return <div className={`tt-home-v2${showStickyCta ? ' has-sticky-cta' : ''}`} id="top">
    <a className="tt-skip" href="#main-content">Skip to content</a>
    <header className="tt-v2-header">
      <Container className="tt-v2-container tt-v2-nav">
        <Link to="/" aria-label="TenTrust home"><Logo/></Link>
        <nav id="main-navigation" className={`tt-v2-menu${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a href="#audiences" onClick={() => setMenuOpen(false)}>For agents</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <Link className="tt-mobile-login" to="/auth" onClick={() => setMenuOpen(false)}>Log in</Link>
          <Link className="tt-mobile-verify" to="/auth?action=verify" onClick={() => setMenuOpen(false)}>Verify a tenant</Link>
        </nav>
        <div className="tt-nav-right">
          <Link className="tt-v2-login" to="/auth">Log in</Link>
          <Link className="tt-button tt-button-primary" to="/auth?action=verify">Verify a tenant</Link>
          <button className="tt-v2-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X aria-hidden="true"/> : <span aria-hidden="true">☰</span>}
          </button>
        </div>
      </Container>
    </header>

    <main id="main-content">
      <section className="tt-v2-hero-wrap" ref={heroRef}>
        <Container className="tt-v2-container">
          <div className="tt-v2-hero">
            <div className="tt-v2-hero-copy">
              <span className="tt-v2-badge"><i aria-hidden="true"/>Built for Nigerian landlords and agents</span>
              <h1>Verify your tenant before you hand over the keys</h1>
              <p>Make rental decisions with clear, consent-based checks that help people start their next chapter with confidence.</p>
              <div className="tt-v2-actions">
                <Link className="tt-button tt-button-primary" to="/auth?action=verify">Verify a tenant <ArrowRight size={18} aria-hidden="true"/></Link>
                <button className="tt-button tt-button-secondary" type="button" onClick={() => setSampleOpen(true)}>See a sample report</button>
              </div>
              <div className="tt-hero-mobile-sample"><SampleReportCard compact checks={sampleChecks}/></div>
              <div className="tt-v2-price" aria-label="Pricing and turnaround">
                <span>{priceLabel ? `From ${priceLabel} per check` : 'Current price to be confirmed'}</span>
                <span>Results in about {siteConfig.turnaround}</span>
              </div>
            </div>
            <div className="tt-hero-desktop-sample"><SampleReportCard checks={sampleChecks}/></div>
          </div>
        </Container>
      </section>

      <section className="tt-proof-strip"><Container className="tt-v2-container">
        {proofs.length ? proofs.map((proof, index) => <span key={`${proof}-${index}`}><CheckCircle2 size={17} aria-hidden="true"/>{proof}</span>) : <span><CheckCircle2 size={17} aria-hidden="true"/>Consent-based screening</span>}
      </Container></section>

      <section className="tt-v2-section tt-report-section" id="sample-report">
        <Container className="tt-v2-container">
          <Heading eyebrow={siteConfig.reportEyebrow} title={siteConfig.reportHeading}>{siteConfig.reportDescription}</Heading>
          {pricingLoading ? <p className="tt-checks-state" role="status">Loading plan inclusions…</p> : availablePackages.length ? <div className="tt-plan-includes-grid">
            {availablePackages.map((tier) => {
              const checks = landingReportChecks.filter((check) => check.live && tier.checks.includes(check.id));
              return <article className="tt-plan-includes-card" key={tier.id}>
                <div className="tt-plan-includes-title"><h3>{tier.name}</h3><span className={tier.enabled ? 'is-available' : 'is-unavailable'}>{tier.enabled ? 'Available now' : 'Not available yet'}</span></div>
                <p>{tier.description}</p>
                <h4>Included in this plan</h4>
                {checks.length ? <ul>
                  {checks.map((check) => {
                    const Icon = reportIconByType[check.icon];
                    return <li key={check.id}><span className="tt-check-icon"><Icon size={19} aria-hidden="true"/></span><span><strong>{check.label}</strong><small>{check.description}</small></span></li>;
                  })}
                </ul> : <p className="tt-checks-state">{tier.enabled ? 'No live checks are currently configured for this plan.' : tier.unavailable_reason || 'This plan is not available yet.'}</p>}
              </article>;
            })}
          </div> : <p className="tt-checks-state" role="status">Plan inclusions will appear here when the screening packages are active.</p>}
        </Container>
      </section>

      <section className="tt-v2-section tt-v2-how" id="how-it-works">
        <Container className="tt-v2-container">
          <Heading centered eyebrow="Simple by design" title="Three steps, about two minutes of your time">A consent-led check that’s easy to follow from start to result.</Heading>
          <div className="tt-v2-steps">
            {verificationSteps.map((step) => <article className="tt-v2-card tt-v2-step" key={step.number}>
              <span className="tt-step-dot">{step.number}</span>
              <span className="tt-step-icon">{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>)}
          </div>
        </Container>
      </section>

      <section className="tt-v2-section tt-v2-pricing" id="pricing">
        <Container className="tt-v2-container">
          <Heading centered eyebrow="Straightforward pricing" title="Pay only for the checks you need">See the key details upfront, before you invite a tenant.</Heading>
          <LandingPricingTiers packages={availablePackages} loading={pricingLoading} unavailable={pricingUnavailable} localPricingOutdated={priceConfigOutdated}/>
          <div className="tt-pricing-action"><Link className="tt-button tt-button-primary" to="/pricing">View all pricing <ArrowRight size={18} aria-hidden="true"/></Link></div>
        </Container>
      </section>

      <section className="tt-v2-privacy">
        <Container className="tt-v2-container">
          <p className="tt-eyebrow">Built around respect</p>
          <h2>Your tenant’s privacy comes first</h2>
          <div className="tt-privacy-grid">
            <article><span className="tt-icon-tile" aria-hidden="true"><CheckCircle2/></span><div><h3>Consent first</h3><p>We only check after the tenant agrees to share their details.</p></div></article>
            <article><span className="tt-icon-tile" aria-hidden="true"><Lock/></span><div><h3>Private by design</h3><p>Landlords never see a raw BVN or NIN in the report.</p></div></article>
            <article><span className="tt-icon-tile" aria-hidden="true"><ShieldCheck/></span><div><h3>Handled with care</h3><p>{siteConfig.ndpaConfirmed ? 'Aligned with the Nigeria Data Protection Act.' : 'Designed with Nigeria’s data protection requirements in mind.'}</p></div></article>
          </div>
          <p className="tt-privacy-outcome">Landlords see Verified or Needs review, never the ID number itself.</p>
          <Link to="/privacy" className="tt-light-link">Read our privacy policy <ArrowRight size={16} aria-hidden="true"/></Link>
        </Container>
      </section>

      <section className="tt-v2-section tt-v2-audiences" id="audiences">
        <Container className="tt-v2-container">
          <Heading centered eyebrow="Made for the rental journey" title="Better renting takes everyone.">One clearer process for people finding a home and the people helping them settle in.</Heading>
          <div className="tt-v2-audience-grid">
            <article className="tt-v2-card tt-audience-card"><span className="tt-icon-tile" aria-hidden="true"><UserRound/></span><p className="tt-eyebrow">FOR LANDLORDS</p><h3>Make informed decisions with confidence.</h3><ul>{siteConfig.benefits.landlords.map((benefit) => <li key={benefit}><CheckCircle2 aria-hidden="true"/>{benefit}</li>)}</ul><Link to="/auth?action=verify">Verify a tenant <ArrowRight size={16} aria-hidden="true"/></Link></article>
            <article className="tt-v2-card tt-audience-card"><span className="tt-icon-tile" aria-hidden="true"><Building2/></span><p className="tt-eyebrow">FOR AGENTS</p><h3>Bring clarity to every application.</h3><ul>{siteConfig.benefits.agents.map((benefit) => <li key={benefit}><CheckCircle2 aria-hidden="true"/>{benefit}</li>)}</ul><Link to="/auth?action=verify">Explore verification <ArrowRight size={16} aria-hidden="true"/></Link></article>
          </div>
          <a className="tt-tenant-strip" href="/comingsoon/"><span><UserRound size={20} aria-hidden="true"/><strong>Tenants: build your own trust profile</strong><small>Coming soon — take your rental history with you.</small></span><ArrowRight aria-hidden="true"/></a>
        </Container>
      </section>

      <section className="tt-v2-section tt-v2-faq" id="faq">
        <Container className="tt-v2-container tt-faq-layout">
          <Heading eyebrow="Good to know" title="Questions, answered.">We believe a fair process should be easy to understand.</Heading>
          <div className="tt-v2-faq-list">{siteConfig.faq.map((item) => <details key={item.question}><summary><span>{item.question}</span><i aria-hidden="true"/></summary><p>{item.answer}</p></details>)}</div>
        </Container>
      </section>

      <section className="tt-v2-closing"><Container className="tt-v2-container">
        <div><p className="tt-eyebrow">A clearer rental journey starts here</p><h2>Ready to verify your next tenant?</h2><p>Get the information you need to take the next step with confidence.</p></div>
        <div><Link className="tt-button tt-button-white" to="/auth?action=verify">Verify a tenant <ArrowRight size={18} aria-hidden="true"/></Link><small>{priceLabel ? `From ${priceLabel} per check` : 'Current price to be confirmed'} · Results in about {siteConfig.turnaround}</small></div>
      </Container></section>
    </main>

    <footer className="tt-v2-footer" ref={footerRef}>
      <Container className="tt-v2-container">
        <div className="tt-footer-grid">
          <div><Link to="/" aria-label="TenTrust home"><Logo/></Link><p>Clearer checks. More confident renting.</p></div>
          <div><h3>Product</h3><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="/comingsoon/">Coming soon</a></div>
          <div><h3>Company</h3><Link to="/auth">Log in</Link><a href={siteConfig.socials.linkedin || '#'}>LinkedIn</a><a href={siteConfig.socials.instagram || '#'}>Instagram</a></div>
          <div><h3>Legal &amp; contact</h3><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>{siteConfig.whatsapp && <a href={`https://wa.me/${siteConfig.whatsapp.replace(/\D/g, '')}`}>WhatsApp support</a>}{siteConfig.registeredAddress && <span className="tt-footer-address"><MapPin size={15} aria-hidden="true"/>{siteConfig.registeredAddress}</span>}</div>
        </div>
        <div className="tt-footer-bottom"><span>© {new Date().getFullYear()} TenTrust. All rights reserved.</span><a href="#top">Back to top ↑</a></div>
      </Container>
    </footer>

    {showStickyCta && <div className="tt-sticky-verify"><Link className="tt-button tt-button-primary" to="/auth?action=verify">Verify a tenant <ArrowRight size={18} aria-hidden="true"/></Link></div>}

    <dialog className="tt-sample-dialog" ref={reportDialogRef} aria-label="Sample report, fictional tenant data" aria-labelledby="sample-dialog-title" onClose={() => setSampleOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setSampleOpen(false); }}>
      <div className="tt-sample-dialog-head"><h2 id="sample-dialog-title">A sample tenant report</h2><button type="button" className="tt-sample-dialog-close" aria-label="Close sample report" onClick={() => setSampleOpen(false)}><X size={20} aria-hidden="true"/></button></div>
      <SampleReportCard checks={sampleChecks}/>
    </dialog>
  </div>;
}
