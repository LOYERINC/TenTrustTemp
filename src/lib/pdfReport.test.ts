import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityPdf, type IdentityReport } from './pdfReport';

const sample: IdentityReport = {
  tenant_name: 'Sample Tenant', property_title: 'Sample Property', status: 'complete', report_id: 'sample-only',
  check_status: { identity_provider: 'interswitch', environment: 'sandbox', video_review: 'reviewed' },
  published_report: { state: 'published', approved_at: '2026-11-25T12:00:00Z',
    findings: [{ id: 'loan_history', title: 'Loan history', text: 'No records returned; this does not prove absence of debt.' }],
    staff_note: 'A long staff note. '.repeat(120), follow_up: [], limitations: ['Sample data only.'] },
};

test('approved factual snapshot is included offline with valid PDF page references', () => {
  const pdf = buildIdentityPdf(sample);
  assert.match(pdf, /No records returned/);
  assert.match(pdf, /Sample data only/);
  const pages = [...pdf.matchAll(/\/Type \/Page \/Parent/g)];
  assert.ok(pages.length >= 3);
  const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  const objects = [...pdf.matchAll(/^(\d+) 0 obj/gm)];
  const entries = [...pdf.matchAll(/^(\d{10}) 00000 n/gm)];
  assert.equal(objects.length, entries.length);
  objects.forEach((object, index) => assert.equal(object.index, Number(entries[index][1])));
});

test('an incomplete case cannot include a published snapshot in its PDF', () => {
  const pdf = buildIdentityPdf({ ...sample, status: 'incomplete' });
  assert.doesNotMatch(pdf, /APPROVED CHECK FINDINGS/);
  assert.doesNotMatch(pdf, /No records returned/);
});

test('approved free-text analysis is rendered alongside supporting loan evidence', () => {
  const statement = { text: 'A conflicting closing date requires clarification.', evidence: ['loans.loan_1'] };
  const pdf = buildIdentityPdf({ ...sample, published_report: { ...sample.published_report!, staff_note: '',
    analysis: { summary: statement, observations: [], concerns: [statement], missing_information: [], questions_for_admin: [] },
    loan_details: [{ record_id: 'loan_1', institution: 'SAMPLE BANK', source_group: 'group_1', loan_status: 'open',
      performance_status: 'performing', date_opened: '2022-06-30', closed_date: '2022-06-21', currency: 'NGN',
      opening_balance: '0', repayment_amount: '23000000', repayment_frequency: 'monthly', tenor: 0,
      repayment_schedule: [{ date: '2022-06', status: 'pending' }] }],
  } });
  assert.match(pdf, /Executive summary/);
  assert.match(pdf, /A conflicting closing date/);
  assert.match(pdf, /Institution: SAMPLE BANK/);
  assert.match(pdf, /2022-06 - pending/);
  assert.doesNotMatch(pdf, /"loan_status"/); // Human-readable records, not raw JSON.
});

test('human decision and paragraph reasons are distinct from AI analysis', () => {
  const pdf = buildIdentityPdf({ ...sample, published_report: { ...sample.published_report!, staff_note: '',
    admin_decision: { origin: 'administrator', outcome: 'further_information_required',
      reasons: 'Synthetic administrator explanation.\n\nUpdated documentation is requested before a decision is made.' },
  } });
  assert.match(pdf, /Administrator's recorded decision/);
  assert.match(pdf, /Further information required/);
  assert.match(pdf, /Reasons recorded by the administrator/);
  assert.match(pdf, /Updated documentation is requested/);
});
