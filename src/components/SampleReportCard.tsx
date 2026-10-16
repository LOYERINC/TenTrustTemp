import { Briefcase, IdentificationCard, MapPin, Phone, Users } from '../lib/icons';
import { landingReportChecks, type LandingReportCheck, type ReportCheckIcon } from '../config/landing-report-checks';

const iconByType: Record<ReportCheckIcon, typeof IdentificationCard> = {
  'id-card': IdentificationCard,
  phone: Phone,
  briefcase: Briefcase,
  'map-pin': MapPin,
  people: Users,
};

export default function SampleReportCard({ compact = false, large = false, checks = landingReportChecks.filter((check) => check.live) }: { compact?: boolean; large?: boolean; checks?: LandingReportCheck[] }) {
  return <article className={`tt-report-card${large ? ' tt-report-large' : ''}${compact ? ' tt-report-compact' : ''}`} aria-label="Sample report with fictional details">
    <div className="tt-report-head">
      <div className="tt-report-avatar" aria-hidden="true">AN</div>
      <div className="tt-report-person"><strong>Adaeze N.</strong><span>Lekki, Lagos</span></div>
      <span className="tt-badge tt-badge-warning">Sample</span>
    </div>
    <div className="tt-report-caption">TENANT VERIFICATION REPORT</div>
    <div className="tt-report-rows">
      {checks.map((check, index) => {
        const Icon = iconByType[check.icon];
        const verified = index === 0;
        return <div className="tt-report-row" key={check.id}>
          <span className="tt-report-row-icon" aria-hidden="true"><Icon size={17}/></span>
          <span className="tt-report-row-label">{check.label}</span>
          <span className={`tt-badge ${verified ? 'tt-badge-success' : 'tt-badge-warning'}`}>{verified ? 'Verified' : 'Sample'}</span>
        </div>;
      })}
    </div>
    <p className="tt-fake-label">Sample report, fictional data</p>
  </article>;
}
