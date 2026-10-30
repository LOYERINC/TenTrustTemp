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
  const features = [...new Set(packages.flatMap((tier) => tier.checks))]
    .filter((feature) => pricingEngineCheckLabels[feature])
    .filter((feature) => landingReportChecks.find((check) => check.id === feature)?.live ?? false);

  return <div className="tt-landing-pricing">
    {loading ? <p className="tt-pricing-state" role="status">Loading plans…</p> : unavailable || packages.length === 0 ? <p className="tt-pricing-state" role="status">{siteConfig.pricingUnavailable}</p> : <>
      {localPricingOutdated && <p className="tt-pricing-engine-note">These are the latest prices for each plan.</p>}
      <div className="tt-pricing-carousel" role="region" aria-label="Tenant check plans" tabIndex={0}>
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
                {includes.length === 0 && <li className="tt-tier-empty">{tier.enabled ? 'No checks are ready for this plan yet.' : tier.unavailable_reason || 'This plan is not available yet.'}</li>}
              </ul>
              <p className="pricing-turnaround"><Clock size={16}/>{siteConfig.pricingTurnaround}</p>
              <p className="pricing-does-not-cover"><strong>Not in this plan</strong><span>{doesNotCover}</span></p>
            </article>;
          })}
        </div>
      </div>
      {packages.length > 1 && <details className="tt-pricing-compare" id="tier-comparison">
        <summary>{siteConfig.compareTiersLabel}</summary>
        <div className="tt-pricing-table-scroll" tabIndex={0} aria-label="Scrollable tier comparison">
          <table>
            <caption>What each plan checks</caption>
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
