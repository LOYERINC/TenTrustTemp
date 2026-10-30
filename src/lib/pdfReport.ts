export interface IdentityReport {
  tenant_name: string; property_title: string; status: string; name_match?: string | null;
  identity_verified_at?: string | null; report_id?: string | null; masked_document?: string | null;
  check_status?: Record<string, string>;
  credit_report?: {type?:string;body?:string;verdict?:string;published_at?:string;revision?:number};
}

function escapePdf(text: string) { return text.replaceAll('\u2022', '*').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }

/** Builds a small one-page PDF with built-in fonts, so reports work offline without a PDF dependency. */
interface PdfLogo { hex:string; width:number; height:number; }
function logoObject(logo:PdfLogo){return `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logo.hex.length+1} >>\nstream\n${logo.hex}>\nendstream`;}
function logoDraw(logo:PdfLogo){return `q 132 0 0 ${Math.min(40,132*logo.height/logo.width)} 50 740 cm /Im1 Do Q`;}

export function buildIdentityReportPdf(report: IdentityReport, logo?:PdfLogo): string {
  if(report.status==='complete'&&report.credit_report?.type==='manual_staff_report')return buildManualPdf(report,logo);
  const date = report.identity_verified_at ? new Date(report.identity_verified_at).toLocaleString() : new Date().toLocaleString();
  const newFlow = report.check_status?.liveness !== undefined;
  const manual = report.check_status?.identity_method === 'manual_review';
  const needsReview = report.check_status?.identity === 'needs_review' || report.check_status?.liveness === 'needs_review' || report.check_status?.credit_result === 'needs_review' || report.check_status?.affordability === 'review' || Boolean(report.name_match && report.name_match !== 'match');
  const verified = report.status === 'complete';
  const sandbox = report.check_status?.environment
    ? report.check_status.environment !== 'production'
    : import.meta.env?.VITE_DEMO_MODE === 'true';
  const lines = [
    { text: 'TenTrust', size: 22, y: 748, color: '0.11 0.31 0.85' },
    { text: sandbox ? 'SANDBOX DEMO - SAMPLE REPORT' : manual ? 'MANUAL TENANT REVIEW REPORT' : newFlow ? 'TENANT SCREENING REPORT' : 'IDENTITY VERIFICATION REPORT', size: 11, y: 714, color: '0.39 0.45 0.55' },
    { text: `Report ID: ${report.report_id || 'Pending'}`, size: 11, y: 685, color: '0.06 0.09 0.16' },
    { text: `Date: ${date}`, size: 11, y: 666, color: '0.06 0.09 0.16' },
    { text: verified ? newFlow ? needsReview ? 'Screening complete - needs review' : manual ? 'Manual review complete - read staff findings' : 'Screening report ready - review results' : sandbox ? 'Sandbox identity check complete' : 'Identity verified' : 'Could not verify', size: 20, y: 616, color: verified && !needsReview ? '0.09 0.45 0.23' : '0.72 0.38 0.03' },
    { text: `Tenant: ${report.tenant_name}`, size: 12, y: 570, color: '0.06 0.09 0.16' },
    { text: `Property: ${report.property_title}`, size: 12, y: 546, color: '0.06 0.09 0.16' },
    { text: `Name match: ${report.name_match || 'Not available'}`, size: 12, y: 522, color: '0.06 0.09 0.16' },
    { text: `Document: ${report.masked_document || 'Not available'}`, size: 12, y: 498, color: '0.06 0.09 0.16' },
    ...(['identity', 'liveness', 'credit_bureau', 'credit_result', 'affordability'] as const).filter(key=>report.check_status?.[key]).map((key,index)=>({text: `${key.replaceAll('_',' ')}: ${report.check_status![key].replaceAll('_',' ')}`,size:12,y:460-index*24,color:'0.06 0.09 0.16'})),
    { text: sandbox ? 'DEMO DATA ONLY. This does not verify a real person or support a rental decision.' : manual ? 'Manual review of tenant-submitted details. No automated ID or bureau checks.' : 'This report supports a landlord review. It is not a rental decision.', size: 10, y: 70, color: '0.39 0.45 0.55' },
    ...(manual ? [{text:'This report supports human review. It is not a rental decision.',size:10,y:55,color:'0.39 0.45 0.55'}] : []),
  ];
  const stream = ['0.11 0.31 0.85 rg 0 792 612 9 re f', ...(logo?[logoDraw(logo)]:[]), ...lines.filter(l=>!logo||l.text!=='TenTrust').map(l => `BT /F1 ${l.size} Tf ${l.color} rg 50 ${l.y} Td (${escapePdf(l.text)}) Tj ET`)].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> ${logo?'/XObject << /Im1 6 0 R >>':''} >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  if(logo)objects.push(logoObject(logo));
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export async function downloadIdentityReport(report:IdentityReport) {
  const {default:tenTrustLogoUrl}=await import('../assets/tentrust-logo.png');
  const img=new Image();img.src=tenTrustLogoUrl;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Report logo could not load. Please try again.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
  const bytes=atob(canvas.toDataURL('image/jpeg',0.95).split(',')[1]);
  const logo={width:canvas.width,height:canvas.height,hex:Array.from(bytes,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('')};
  const pdf=buildIdentityReportPdf(report,logo);
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tentrust-report-${report.report_id || 'identity'}.pdf`; anchor.click();
  URL.revokeObjectURL(url);
}


function plain(text:string) {return text.replaceAll('₦','NGN ').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');}
function wrap(text:string,width=78):string[] {
 return plain(text).replace(/\n{3,}/g,'\n\n').split('\n').flatMap(paragraph=>{
   if(!paragraph.trim())return [''];
   const result:string[]=[];let line='';
   for(const word of paragraph.trim().split(/\s+/)){
     let remaining=word;
     if(line&&line.length+remaining.length+1>width){result.push(line);line='';}
     while(remaining.length>width){result.push(remaining.slice(0,width));remaining=remaining.slice(width);}
     line+=(line?' ':'')+remaining;
   }
   if(line)result.push(line);return result;
 });
}
function buildManualPdf(report:IdentityReport,logo?:PdfLogo):string {
 const staff=report.credit_report!;
 const verdict=staff.verdict==='verified'?'Verified by TenTrust':staff.verdict==='needs_review'?'Needs more review':'Reviewed';
 const sandbox=report.check_status?.environment==='sandbox';
 const content=[...wrap(`Tenant: ${report.tenant_name}`),...wrap(`Property: ${report.property_title}`),'',...wrap(staff.body||'')];
 const pages:string[][]=[];for(let i=0;i<content.length;i+=40)pages.push(content.slice(i,i+40));
 const objects:string[]=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 if(logo)objects.push(logoObject(logo));
 const firstPage=objects.length+1;
 pages.forEach((lines,index)=>{
   const pageId=objects.length+1,streamId=pageId+1;
   const text=(value:string,y:number,size=10,font='F1')=>`BT /${font} ${size} Tf 0.06 0.15 0.23 rg 50 ${y} Td (${escapePdf(plain(value))}) Tj ET`;
   const stream=[logo?logoDraw(logo):text('TenTrust',750,22,'F2'),text(sandbox?'SAMPLE - MANUAL REVIEW REPORT':'MANUAL TENANT REVIEW REPORT',723,11,'F2'),text(`${verdict} - Manual staff review`,699,13,'F2'),text(`Report: ${report.report_id||'Pending'}`,677,9),text(`Published: ${staff.published_at||'Not recorded'} | Version ${staff.revision||1}`,662,9),...lines.map((line,i)=>text(line,627-i*13)),text('Manual review of tenant-supplied details. No automated registry or bureau checks.',75,8),text('This report supports human review. It is not a rental decision.',61,8),text(`Page ${index+1} of ${pages.length}`,43,8)].join('\n');
   objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${logo?'/XObject << /Im1 5 0 R >>':''} >> /Contents ${streamId} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 });
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
 objects[1]=`<< /Type /Pages /Kids [${pages.map((_,i)=>`${firstPage+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 offsets.slice(1).forEach(offset=>{pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;});
 return pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}
