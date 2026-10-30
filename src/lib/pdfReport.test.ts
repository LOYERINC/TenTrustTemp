import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityReportPdf } from './pdfReport';
import { writeFileSync,mkdirSync } from 'node:fs';
test('manual PDF keeps long reports on multiple pages and escapes text',()=>{
 const body=Array.from({length:95},(_,i)=>`Finding ${i+1}: The staff reviewed the supplied details (manual checks).`).join('\n')+'\nFINAL FINDING: Rent is ₦1,500. Follow up with the tenant.';
 const pdf=buildIdentityReportPdf({tenant_name:'Synthetic Tenant',property_title:'Example home',status:'complete',report_id:'synthetic-report',check_status:{identity_method:'manual_review',environment:'sandbox'},credit_report:{type:'manual_staff_report',verdict:'verified',body,published_at:'2026-10-30T12:00:00Z',revision:1}});
 assert.match(pdf,/\/Count 3/);assert.match(pdf,/FINAL FINDING/);assert.match(pdf,/NGN 1,500/);assert.match(pdf,/\\\(manual checks\\\)/);assert.match(pdf,/Page 3 of 3/);
 mkdirSync('artifacts/manual-report',{recursive:true});writeFileSync('artifacts/manual-report/synthetic-report.pdf',pdf,'ascii');
});
