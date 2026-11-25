const loanHistoryLabels: ReadonlyMap<string, string> = new Map([
  ['found', 'Loan history returned'],
  ['no_history', 'No loan history returned'],
  ['unknown', 'Lookup needs reconciliation'],
  ['unavailable', 'Loan history unavailable'],
]);

export function publishedLoanHistory(report: Pick<IdentityReport, 'status' | 'check_status'>) {
  if (report.status !== 'complete' || report.check_status?.identity_provider !== 'interswitch') return null;
  return loanHistoryLabels.get(report.check_status.loan_history ?? '') ?? null;
}

export interface IdentityReport {
  tenant_name: string; property_title: string; status: string; name_match?: string | null;
  check_status?: Record<string, string>;
  identity_verified_at?: string | null; report_id?: string | null; masked_document?: string | null;
  published_report?: PublishedReport | null;
}

export interface PublishedReport {
  state: 'published'; approved_at: string; staff_note: string;
  findings: { id: string; title: string; text: string }[];
  follow_up: string[]; limitations: string[];
  analysis?: ReportAnalysis | null;
  loan_details?: Record<string, unknown>[];
  admin_decision?: { outcome: 'selected' | 'not_selected' | 'further_information_required'; reasons: string; origin: 'administrator' } | null;
}

export const adminDecisionLabels = { selected: 'Selected', not_selected: 'Not selected', further_information_required: 'Further information required' };

export interface AnalysisStatement { text: string; evidence: string[]; }
export interface ReportAnalysis {
  summary: AnalysisStatement; observations: AnalysisStatement[]; concerns: AnalysisStatement[];
  missing_information: AnalysisStatement[]; questions_for_admin: AnalysisStatement[];
}

function escapePdf(text: string) { return text.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }

/** Generates locally from approved facts without AI or network access. */
export function buildIdentityPdf(report: IdentityReport) {
  const date = report.identity_verified_at ? new Date(report.identity_verified_at).toLocaleString() : new Date().toLocaleString();
  const verified = report.status === 'complete';
  const completeCheck = report.check_status?.identity_provider === 'interswitch';
  const loanHistory = publishedLoanHistory(report);
  const lines = [
    { text: 'TenTrust', size: 22, y: 748, color: '0.11 0.31 0.85' },
    { text: completeCheck ? 'COMPLETE CHECK REPORT' : 'IDENTITY VERIFICATION REPORT', size: 11, y: 714, color: '0.39 0.45 0.55' },
    { text: `Report ID: ${report.report_id || 'Pending'}`, size: 11, y: 685, color: '0.06 0.09 0.16' },
    { text: `Date: ${date}`, size: 11, y: 666, color: '0.06 0.09 0.16' },
    { text: verified ? (completeCheck ? 'Screening report ready' : 'Identity verified') : 'Could not verify', size: 20, y: 616, color: verified ? '0.09 0.45 0.23' : '0.72 0.38 0.03' },
    { text: `Tenant: ${report.tenant_name}`, size: 12, y: 570, color: '0.06 0.09 0.16' },
    { text: `Property: ${report.property_title}`, size: 12, y: 546, color: '0.06 0.09 0.16' },
    { text: `Name match: ${report.name_match || 'Not available'}`, size: 12, y: 522, color: '0.06 0.09 0.16' },
    { text: `Document: ${report.masked_document || 'Not available'}`, size: 12, y: 498, color: '0.06 0.09 0.16' },
    ...(completeCheck && report.check_status?.video_review ? [{ text: `Staff video review: ${report.check_status.video_review === 'reviewed' ? 'Video reviewed' : 'Needs follow-up'}`, size: 12, y: 450, color: '0.06 0.09 0.16' }] : []),
    ...(completeCheck && report.check_status?.environment === 'sandbox' ? [{ text: 'SANDBOX REPORT - SAMPLE DATA ONLY', size: 11, y: 425, color: '0.39 0.45 0.55' }] : []),
    ...(loanHistory ? [{ text: `Interswitch loan history: ${loanHistory}`, size: 12, y: 474, color: '0.06 0.09 0.16' }] : []),
    { text: 'Evidence analysis and administrator decisions are identified separately.', size: 10, y: 70, color: '0.39 0.45 0.55' },
  ];
  const streams = [['0.11 0.31 0.85 rg 0 792 612 9 re f', ...lines.map(l => `BT /F1 ${l.size} Tf ${l.color} rg 50 ${l.y} Td (${escapePdf(l.text)}) Tj ET`)].join('\n')];
  const snapshot = verified && completeCheck && report.published_report?.state === 'published' ? report.published_report : null;
  if (snapshot) {
    const sections = snapshot.analysis ? [
      ['Executive summary', [snapshot.analysis.summary]], ['Observations', snapshot.analysis.observations],
      ['Repayment concerns', snapshot.analysis.concerns], ['Missing information', snapshot.analysis.missing_information],
      ['Questions for review', snapshot.analysis.questions_for_admin],
    ] as [string, AnalysisStatement[]][] : [];
    const paragraphs = ['APPROVED CHECK FINDINGS',
      ...snapshot.findings.flatMap(finding => [finding.title, finding.text, '']),
      ...sections.flatMap(([title, statements]) => [title, ...statements.flatMap(statement => [statement.text, `Evidence: ${statement.evidence.join(', ')}`, ''])]),
      ...(snapshot.loan_details?.length ? ['Supporting loan records (amount units unconfirmed)',
        ...snapshot.loan_details.flatMap(loan => [[
          `Record: ${String(loan.record_id)}`,
          `Institution: ${String(loan.institution || 'Not supplied')}; source group: ${String(loan.source_group || 'Not supplied')}`,
          `Status: ${String(loan.loan_status)}; performance: ${String(loan.performance_status)}`,
          `Opened: ${String(loan.date_opened || 'Not supplied')}; closing date: ${String(loan.closed_date || 'Not supplied')}`,
          `Currency: ${String(loan.currency || 'Not supplied')}; opening balance: ${String(loan.opening_balance ?? 'Not supplied')}`,
          `Reported repayment amount: ${String(loan.repayment_amount ?? 'Not supplied')}; frequency: ${String(loan.repayment_frequency)}`,
          `Reported tenor: ${String(loan.tenor ?? 'Not supplied')} (unit not confirmed)`,
          'Amounts are provider-reported values; their units and current balances require confirmation.',
          ...(Array.isArray(loan.repayment_schedule) ? loan.repayment_schedule.map((entry: { date?: string; status?: string }) =>
            `Repayment entry: ${entry.date || 'Date not supplied'} - ${entry.status || 'Unknown'}`) : []),
        ].join('\n'), ''])] : []),
      ...(snapshot.staff_note ? ['Staff report note', snapshot.staff_note, ''] : []),
      ...(snapshot.admin_decision ? ["Administrator's recorded decision",
        adminDecisionLabels[snapshot.admin_decision.outcome], 'Reasons recorded by the administrator', snapshot.admin_decision.reasons, ''] : []),
      'Follow-up', ...(snapshot.follow_up.length ? snapshot.follow_up : [snapshot.analysis?.questions_for_admin.length
        ? 'See questions for review above; these require administrative clarification.' : 'No outstanding follow-up recorded.']),
      '', 'Scope and limitations', snapshot.limitations.join('\n')];
    const blocks = paragraphs.map(paragraph => paragraph.split(/\r?\n/).flatMap(line => {
      const words = line.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').match(/\S{1,72}/g) || [];
      const output: string[] = []; let current = '';
      for (const word of words) {
        if (current && current.length + word.length + 1 > 72) { output.push(current); current = ''; }
        current += (current ? ' ' : '') + word;
      }
      output.push(current); return output;
    }));
    const headings = new Set(['APPROVED CHECK FINDINGS', ...snapshot.findings.map(finding => finding.title),
      ...sections.map(([title]) => title), 'Staff report note', 'Follow-up', 'Scope and limitations',
      'Supporting loan records (amount units unconfirmed)']);
    headings.add("Administrator's recorded decision");
    headings.add('Reasons recorded by the administrator');
    const pages: string[][] = []; let currentPage: string[] = [];
    blocks.forEach((block, index) => {
      const next = blocks[index + 1];
      const needs = block.length + (headings.has(paragraphs[index]) && next ? Math.min(next.length, 39) : 0);
      if (currentPage.length && currentPage.length + Math.min(needs, 40) > 40) {
        pages.push(currentPage); currentPage = [];
      }
      if (currentPage.length === 0 && block.every(line => line === '')) return;
      for (const line of block) {
        if (currentPage.length === 40) { pages.push(currentPage); currentPage = []; }
        currentPage.push(line);
      }
    });
    if (currentPage.length) pages.push(currentPage);
    for (const page of pages) {
      streams.push(['BT /F1 15 Tf 0.11 0.31 0.85 rg 50 748 Td (TenTrust - approved findings) Tj ET',
        ...page.map((text, i) => `BT /F1 11 Tf 0.06 0.09 0.16 rg 50 ${710 - i * 16} Td (${escapePdf(text)}) Tj ET`),
        `BT /F1 9 Tf 0.39 0.45 0.55 rg 50 70 Td (Page ${streams.length + 1}) Tj ET`,
      ].join('\n'));
    }
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${streams.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...streams.flatMap((stream, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ]),
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function downloadIdentityReport(report: IdentityReport) {
  const pdf = buildIdentityPdf(report);
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tentrust-report-${report.report_id || 'identity'}.pdf`; anchor.click();
  URL.revokeObjectURL(url);
}
