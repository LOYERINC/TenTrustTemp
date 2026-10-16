export type ReportCheckKey = 'identity' | 'phone' | 'employment' | 'address' | 'references' | 'readiness_score' | 'credit_bureau';
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
  { id: 'identity', label: 'Identity check', description: 'A consent-based match of the tenant’s identity details.', icon: 'id-card', live: true },
  { id: 'phone', label: 'Phone confirmation', description: 'Confirmation of the tenant’s contact number.', icon: 'phone', live: false },
  { id: 'employment', label: 'Employment details', description: 'Employment information supplied by the tenant.', icon: 'briefcase', live: false },
  { id: 'address', label: 'Address confirmation', description: 'Confirmation of the tenant’s current address.', icon: 'map-pin', live: false },
  { id: 'references', label: 'Rental references', description: 'Reference details shared with the tenant’s consent.', icon: 'people', live: false },
  { id: 'readiness_score', label: 'Rent and income score', description: 'A score based on the rent and income information provided.', icon: 'briefcase', live: true },
  { id: 'credit_bureau', label: 'Credit bureau report', description: 'A report from an available credit bureau provider.', icon: 'people', live: false },
];

export const pricingEngineCheckLabels: Record<string, string> = {
  identity: 'Identity check',
  readiness_score: 'Rent and income score',
  credit_bureau: 'Credit bureau report',
  '3_premium_checks': 'Three Premium checks',
};
