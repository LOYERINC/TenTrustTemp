import { useRef, useState } from 'react';
import { Check, Clock } from '../lib/icons';
import { siteConfig } from '../config';
import { landingReportChecks, pricingEngineCheckLabels } from '../config/landing-report-checks';
import type { ScreeningPackage } from '../lib/screeningApi';
import { formatNaira } from '../utils/format.js';

interface LandingPricingTiersProps {
  packages: ScreeningPackage[];
  loading: boolean;
  unavailable: boolean;
  localPricingOutdated: boolean;
}

export default function LandingPricingTiers({ packages, loading, unavailable, localPricingOutdated }: LandingPricingTiersProps) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const features = [...new Set(packages.flatMap((tier) => tier.checks))]
    .filter((feature) => pricingEngineCheckLabels[feature])
    .filter((feature) => landingReportChecks.find((check) => check.id === feature)?.live ?? false);

  const selectTier = (index: number) => {
    setActiveIndex(index);
    const carousel = carouselRef.current;
    const card = carousel?.querySelector<HTMLElement>(`[data-tier-index="${index}"]`);
    if (!carousel || !card) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    carousel.scrollTo({ left: card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const updateActiveTier = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    const cards = [...carousel.querySelectorAll<HTMLElement>('[data-tier-index]')];
    const nearest = cards.reduce((best, card) => {
      const distance = Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - center);
      return distance < best.distance ? { index: Number(card.dataset.tierIndex), distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    setActiveIndex(nearest.index);
  };

  return <div className="tt-landing-pricing">
    {loading ? <p className="tt-pricing-state" role="status">Loading current packages…</p> : unavailable || packages.length === 0 ? <p className="tt-pricing-state" role="status">{siteConfig.pricingUnavailable}</p> : <>
      {localPricingOutdated && <p className="tt-pricing-engine-note">Prices below come from the current screening packages. The local pricing config still needs to be synced.</p>}
      <div className="tt-pricing-carousel" ref={carouselRef} role="region" aria-label="Available screening tiers" tabIndex={0} onScroll={updateActiveTier}>
        <div className="pricing-grid tt-engine-pricing-grid">
          {packages.map((tier, index) => {
            const includes = tier.checks
              .filter((feature) => pricingEngineCheckLabels[feature])
              .filter((feature) => landingReportChecks.find((check) => check.id === feature)?.live ?? false);
            const doesNotCover = siteConfig.pricingDoesNotCover[tier.id as keyof typeof siteConfig.pricingDoesNotCover] ?? siteConfig.defaultPricingDoesNotCover;
            return <article className={`pricing-tier${tier.id === 'standard' ? ' is-recommended' : ''}${tier.enabled ? '' : ' is-unavailable'}`} key={tier.id} data-tier-index={index}>
              {tier.id === 'standard' && <span className="pricing-recommend">Recommended</span>}
              <div className="pricing-tier-title"><h3>{tier.name}</h3><span className={`tt-tier-availability${tier.enabled ? ' is-available' : ' is-unavailable'}`}>{tier.enabled ? 'Available now' : 'Not available yet'}</span></div>
              <p className="pricing-amount">{formatNaira(tier.price)} <small>/ check</small></p>
              <p className="pricing-description">{tier.description}</p>
              <ul aria-label={`Included in ${tier.name}`}>
                {includes.map((feature) => <li key={feature}><Check size={17}/>{pricingEngineCheckLabels[feature]}</li>)}
                {includes.length === 0 && <li className="tt-tier-empty">{tier.enabled ? 'No live checks are currently configured for this package.' : tier.unavailable_reason || 'This plan is not available yet.'}</li>}
              </ul>
              <p className="pricing-turnaround"><Clock size={16}/>{siteConfig.pricingTurnaround}</p>
              <p className="pricing-does-not-cover"><strong>Doesn’t cover</strong><span>{doesNotCover}</span></p>
            </article>;
          })}
        </div>
      </div>
      {packages.length > 1 && <div className="tt-pricing-dots" role="group" aria-label="Choose a pricing tier">
        {packages.map((tier, index) => <button key={tier.id} type="button" className={index === activeIndex ? 'is-active' : ''} aria-label={`Show ${tier.name} tier`} aria-pressed={index === activeIndex} onClick={() => selectTier(index)}><span/></button>)}
      </div>}
      {packages.length > 1 && <details className="tt-pricing-compare" id="tier-comparison">
        <summary>{siteConfig.compareTiersLabel}</summary>
        <div className="tt-pricing-table-scroll" tabIndex={0} aria-label="Scrollable tier comparison">
          <table>
            <caption>Included checks by pricing tier</caption>
            <thead><tr><th scope="col">Included check</th>{packages.map((tier) => <th scope="col" key={tier.id}>{tier.name}{tier.enabled ? '' : ' (not available yet)'}</th>)}</tr></thead>
            <tbody>{features.map((feature) => <tr key={feature}><th scope="row">{pricingEngineCheckLabels[feature]}</th>{packages.map((tier) => <td key={tier.id}>{tier.enabled && tier.checks.includes(feature) ? <><Check size={18} aria-hidden="true"/><span className="sr-only">Included</span></> : <span aria-label={tier.enabled ? 'Not included' : 'Unavailable'}>—</span>}</td>)}</tr>)}</tbody>
            <tfoot><tr><th scope="row">Price per check</th>{packages.map((tier) => <td key={tier.id}>{formatNaira(tier.price)}</td>)}</tr></tfoot>
          </table>
        </div>
      </details>}
      <p className="tt-pricing-upgrade-note">{siteConfig.pricingUpgradeNote}</p>
    </>}
  </div>;
}
