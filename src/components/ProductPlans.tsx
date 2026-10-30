import { Link } from 'react-router-dom';
import { Check } from '../lib/icons';

export const productPlans = [
  { id: 'basic_v2', name: 'Basic', price: 1500, checks: ['BVN check', 'NIN check', 'Liveness check', 'Screening report'] },
  { id: 'intermediate_v2', name: 'Intermediate', price: 3000, checks: ['Everything in Basic', 'Credit check'] },
  { id: 'custom_v2', name: 'Custom', price: null, checks: ['Choose the checks you need', 'Get a price after you choose'] },
];
export default function ProductPlans({ onSelect, selectedId }: { onSelect?: (id: string) => void; selectedId?: string }) {
  return <div className="product-plans" aria-label="Screening packages">{productPlans.map(plan => <article key={plan.id} className={`pricing-tier${selectedId === plan.id ? ' is-selected' : ''}`}>
    {plan.id === 'intermediate_v2' && <span className="pricing-recommend">Most popular</span>}
    <h3>{plan.name}</h3><p className="pricing-amount">{plan.price === null ? 'Price varies' : `₦${plan.price.toLocaleString('en-NG')}`}</p>
    <ul>{plan.checks.map(check => <li key={check}><Check size={18} aria-hidden="true"/>{check}</li>)}</ul>
    {plan.price === null ? <Link className="tt-button tt-button-secondary" to="/pricing?custom=1#custom-builder">Build your own</Link> : onSelect ? <button className="tt-button tt-button-primary" type="button" aria-pressed={selectedId === plan.id} onClick={() => onSelect(plan.id)}>Select {plan.name}</button> : <Link className="tt-button tt-button-primary" to={`/dashboard?package=${plan.id}`}>Select {plan.name}</Link>}
  </article>)}</div>;
}
