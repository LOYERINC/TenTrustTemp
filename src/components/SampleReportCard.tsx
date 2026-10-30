import { Briefcase, IdentificationCard, MapPin, Phone, ShieldCheck, Users } from '../lib/icons';
import { landingReportChecks, type LandingReportCheck, type ReportCheckIcon } from '../config/landing-report-checks';

const iconByType: Record<ReportCheckIcon, typeof IdentificationCard> = {
  'id-card': IdentificationCard,
  phone: Phone,
  briefcase: Briefcase,
  'map-pin': MapPin,
  people: Users,
};

// Fictional presentation only; keep actual package capabilities and reports separate.
const sampleResults: Partial<Record<LandingReportCheck['id'], { label: string; description: string; outcome: string }>> = {
  bvn: { label: 'Bank identity confirmed', description: 'Bank details match the name given.', outcome: 'Verified' },
  nin: { label: 'National ID confirmed', description: 'ID details match the name given.', outcome: 'Verified' },
  liveness: { label: 'Selfie matches ID photo', description: 'The face matches the ID photo.', outcome: 'Passed' },
  report: { label: 'Criminal & fraud screening', description: 'No criminal or fraud flags found.', outcome: 'Clear' },
  credit_bureau: { label: 'Credit history & loan defaults', description: 'Credit score and past loan payments.', outcome: 'Score: 712' },
  readiness_score: { label: 'Rent and income score', description: 'A look at income and rent costs.', outcome: 'Score: 712' },
};

export default function SampleReportCard({ compact = false, large = false, checks = landingReportChecks.filter((check) => check.live) }: { compact?: boolean; large?: boolean; checks?: LandingReportCheck[] }) {
  return <article className={`tt-report-card${large ? ' tt-report-large' : ''}${compact ? ' tt-report-compact' : ''}`} aria-label="Sample report with fictional details">
    <div className="tt-report-head">
      <div className="tt-report-avatar" aria-hidden="true">AN</div>
      <div className="tt-report-person"><strong>Adaeze N.</strong><span>Lekki, Lagos</span></div>
      <span className="tt-badge tt-badge-warning">Sample report</span>
    </div>
    <div className="tt-report-verdict"><ShieldCheck size={22} aria-hidden="true"/><div><strong>Low risk</strong><span>No major concerns found.</span></div></div>
    <div className="tt-report-caption">TENANT CHECK REPORT</div>
    <div className="tt-report-rows">
      {checks.filter((check) => check.id !== 'identity').map((check) => {
        const Icon = iconByType[check.icon];
        const result = sampleResults[check.id] ?? { label: check.label, description: check.description, outcome: 'Verified' };
        return <div className="tt-report-row" key={check.id}>
          <span className="tt-report-row-icon" aria-hidden="true"><Icon size={17}/></span>
          <span className="tt-report-row-label"><strong>{result.label}</strong><small>{result.description}</small></span>
          <span className="tt-badge tt-badge-success">{result.outcome}</span>
        </div>;
      })}
    </div>
    <p className="tt-fake-label">Sample report. These details are made up.</p>
  </article>;
}
