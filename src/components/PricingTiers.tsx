import { Check, Clock, Sparkles } from '../lib/icons';
import { agentPacks, tiers } from '../config/pricing.js';
import { formatNaira } from '../utils/format.js';

export default function PricingTiers({ compact = false }: { compact?: boolean }) {
  const basic = tiers[0];
  return <div className={`pricing-block${compact ? ' pricing-block-compact' : ''}`}>
    <div className="pricing-grid">
      {tiers.map((tier) => <article className={`pricing-tier${tier.recommended ? ' is-recommended' : ''}`} key={tier.id}>
        {tier.recommended && <span className="pricing-recommend"><Sparkles size={14}/> Popular</span>}
        <div className="pricing-tier-title"><h3>{tier.name}</h3><span>{tier.turnaround}</span></div>
        <p className="pricing-amount">{formatNaira(tier.price)} <small>/ check</small></p>
        <p className="pricing-description">{tier.description}</p>
        <ul>{tier.includes.map((item) => <li key={item}><Check size={17}/>{item}</li>)}</ul>
        <p className="pricing-turnaround"><Clock size={16}/> Turnaround: {tier.turnaround}</p>
      </article>)}
    </div>
    <section className="agent-packs" aria-labelledby="agent-packs-title">
      <div><p className="pricing-eyebrow">For regular checks</p><h3 id="agent-packs-title">Agent packs</h3></div>
      <div className="agent-pack-list">{agentPacks.map((pack) => {
        const perCheck = Math.round(basic.price * (1 - pack.discountPercent / 100));
        return <div className="agent-pack" key={pack.id}><strong>{pack.checks} checks</strong><span>{pack.discountPercent}% off</span><small>{formatNaira(perCheck)} / check</small></div>;
      })}</div>
    </section>
  </div>;
}
