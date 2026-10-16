import { Link } from 'react-router-dom';
import { ArrowLeft } from '../lib/icons';
import { Brand } from '../components/mvp-ui';
import PricingTiers from '../components/PricingTiers';

export default function Pricing() {
  return <div className="tt-app pricing-page"><header className="pricing-page-header"><div className="tt-shell"><Link to="/" aria-label="TenTrust home"><Brand/></Link><Link to="/dashboard" className="pricing-back"><ArrowLeft size={17}/> Dashboard</Link></div></header><main className="tt-shell pricing-page-main"><p className="tt-eyebrow">Straightforward pricing</p><h1>Choose the checks that fit.</h1><p className="pricing-page-lede">Clear options for a more confident rental decision. Prices, turnaround times, and included checks are draft placeholders pending confirmation.</p><PricingTiers/><Link to="/auth?action=verify" className="tt-button tt-button-primary pricing-cta">Start a verification</Link></main></div>;
}
