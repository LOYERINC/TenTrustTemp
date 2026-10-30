export type ReportCheckKey = 'identity' | 'phone' | 'employment' | 'address' | 'references' | 'readiness_score' | 'credit_bureau' | 'bvn' | 'nin' | 'liveness' | 'report';
export type ReportCheckIcon = 'id-card' | 'phone' | 'briefcase' | 'map-pin' | 'people';

export interface LandingReportCheck {
  id: ReportCheckKey;
  label: string;
  description: string;
  icon: ReportCheckIcon;
  live: boolean;
}

// Keep proposed checks off the page until the product is actually able to return them.
export const landingReportChecks: LandingReportCheck[] = [
  { id: 'bvn', label: 'BVN check', description: 'Check your tenant’s BVN with Mono.', icon: 'id-card', live: true },
  { id: 'nin', label: 'NIN check', description: 'Check your tenant’s NIN with Mono.', icon: 'id-card', live: true },
  { id: 'liveness', label: 'Liveness check', description: 'Our staff review a short video challenge.', icon: 'people', live: true },
  { id: 'report', label: 'Screening report', description: 'See the check results in one report.', icon: 'id-card', live: true },
  { id: 'identity', label: 'Identity check', description: 'We check the tenant’s ID details after they agree.', icon: 'id-card', live: true },
  { id: 'phone', label: 'Phone confirmation', description: 'Confirmation of the tenant’s contact number.', icon: 'phone', live: false },
  { id: 'employment', label: 'Employment details', description: 'Employment information supplied by the tenant.', icon: 'briefcase', live: false },
  { id: 'address', label: 'Address confirmation', description: 'Confirmation of the tenant’s current address.', icon: 'map-pin', live: false },
  { id: 'references', label: 'Rental references', description: 'Reference details shared with the tenant’s consent.', icon: 'people', live: false },
  { id: 'readiness_score', label: 'Rent and income score', description: 'A score based on the rent and pay details shared.', icon: 'briefcase', live: false },
  { id: 'credit_bureau', label: 'Credit bureau report', description: 'A report from an available credit bureau provider.', icon: 'people', live: true },
];

export const pricingEngineCheckLabels: Record<string, string> = {
  bvn: 'BVN check', nin: 'NIN check', liveness: 'Liveness check', report: 'Screening report',
  identity: 'Identity check',
  readiness_score: 'Rent and income score',
  credit_bureau: 'Credit bureau report',
  '3_premium_checks': 'Three Premium checks',
};
