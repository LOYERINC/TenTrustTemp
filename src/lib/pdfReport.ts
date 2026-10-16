export interface IdentityReport {
  tenant_name: string; property_title: string; status: string; name_match?: string | null;
  identity_verified_at?: string | null; report_id?: string | null; masked_document?: string | null;
}

function escapePdf(text: string) { return text.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }

/** Builds a small one-page PDF with built-in fonts, so reports work offline without a PDF dependency. */
export function downloadIdentityReport(report: IdentityReport) {
  const date = report.identity_verified_at ? new Date(report.identity_verified_at).toLocaleString() : new Date().toLocaleString();
  const verified = report.status === 'complete';
  const lines = [
    { text: 'TenTrust', size: 22, y: 748, color: '0.11 0.31 0.85' },
    { text: 'IDENTITY VERIFICATION REPORT', size: 11, y: 714, color: '0.39 0.45 0.55' },
    { text: `Report ID: ${report.report_id || 'Pending'}`, size: 11, y: 685, color: '0.06 0.09 0.16' },
    { text: `Date: ${date}`, size: 11, y: 666, color: '0.06 0.09 0.16' },
    { text: verified ? 'Identity verified' : 'Could not verify', size: 20, y: 616, color: verified ? '0.09 0.45 0.23' : '0.72 0.38 0.03' },
    { text: `Tenant: ${report.tenant_name}`, size: 12, y: 570, color: '0.06 0.09 0.16' },
    { text: `Property: ${report.property_title}`, size: 12, y: 546, color: '0.06 0.09 0.16' },
    { text: `Name match: ${report.name_match || 'Not available'}`, size: 12, y: 522, color: '0.06 0.09 0.16' },
    { text: `Document: ${report.masked_document || 'Not available'}`, size: 12, y: 498, color: '0.06 0.09 0.16' },
    { text: 'This report supports a landlord review. It is not a rental decision.', size: 10, y: 70, color: '0.39 0.45 0.55' },
  ];
  const stream = ['0.11 0.31 0.85 rg 0 792 612 9 re f', ...lines.map(l => `BT /F1 ${l.size} Tf ${l.color} rg 50 ${l.y} Td (${escapePdf(l.text)}) Tj ET`)].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tentrust-report-${report.report_id || 'identity'}.pdf`; anchor.click();
  URL.revokeObjectURL(url);
}
