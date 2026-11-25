import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Toast } from './mvp-ui';
import { formatScreeningError, screeningApi } from '../lib/screeningApi';
import type { ReportAnalysis } from '../lib/pdfReport';

type Evidence = { loan_history: 'found' | 'no_history'; facility_count: number; providers: string[]; video_url: string; loans?: Record<string, unknown>[] };
type ReportDraft = {
  state: 'draft'; generator: 'verified-facts-template' | 'gemini-validated' | 'gemini-analysis';
  findings: { id: string; title: string; text: string; source_fields: string[] }[];
  follow_up: string[]; limitations: string[];
  staff_note: string;
  analysis?: ReportAnalysis | null;
  analysis_model?: string | null;
};

export default function CompleteCheckStaffReview({ id, onClose, onPublished }: {
  id: string; onClose: () => void; onPublished: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [videoReview, setVideoReview] = useState<'' | 'reviewed' | 'needs_review'>('');
  const [approved, setApproved] = useState(false);
  const [decision, setDecision] = useState('');
  const [decisionReasons, setDecisionReasons] = useState('');
  const base = `/api/admin/complete-check/${encodeURIComponent(id)}`;

  async function load() {
    setBusy(true);
    setError('');
    setApproved(false);
    setDecision('');
    setDecisionReasons('');
    try {
      const [loadedEvidence, loadedDraft] = await Promise.all([
        screeningApi<Evidence>(base), screeningApi<ReportDraft>(base + '/report-draft'),
      ]);
      setEvidence(loadedEvidence);
      setDraft(loadedDraft);
      setApproved(false);
      setVideoReview('');
      setDraftNotice('Factual report ready. Request Gemini analysis, or review the factual report if AI is unavailable.');
    } catch (err) {
      setEvidence(null);
      setError(formatScreeningError(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    dialog.current?.showModal();
    void load();
  }, [base]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !evidence || !draft || !approved || !videoReview || !decision || decisionReasons.trim().length < 20) return;
    setBusy(true);
    setError('');
    try {
      await screeningApi(base + '/publish', { method: 'POST', body: JSON.stringify({
        video_review: videoReview, report: { ...draft, admin_decision: {
          outcome: decision, reasons: decisionReasons.trim(), origin: 'administrator',
        } }, report_approved: approved,
      }) });
      onPublished();
    } catch (err) {
      setError(formatScreeningError(err));
    } finally {
      setBusy(false);
    }
  }

  async function previewReport() {
    setBusy(true);
    setError('');
    setDraft(null);
    setDraftNotice('');
    setApproved(false);
    try {
      setDraft(await screeningApi<ReportDraft>(base + '/report-draft?video_review=' + (videoReview || 'pending')));
    } catch (err) {
      setError(formatScreeningError(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateDraft() {
    setBusy(true);
    setError('');
    setDraftNotice('');
    setApproved(false);
    try {
      const result = await screeningApi<{ report: ReportDraft; generation: { outcome: string } }>(
        base + '/report-draft/generate', { method: 'POST', body: JSON.stringify({ video_review: videoReview || 'pending' }) });
      setDraft(result.report);
      setDraftNotice(result.generation.outcome === 'validated'
        ? 'Gemini analysis is ready for your review. Check its interpretations against the source records before approval.'
        : 'Gemini did not return a validated draft. The factual template is shown instead.');
    } catch (err) {
      setDraftNotice('Optional wording is unavailable. Use the factual draft to continue.');
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="complete-staff-title"
    className="mx-auto my-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-white p-6 backdrop:bg-slate-950/50">
    <div className="flex items-center justify-between gap-4">
      <h2 id="complete-staff-title" className="text-xl font-bold">Complete Check review</h2>
      <Button kind="secondary" onClick={() => dialog.current?.close()}>Close</Button>
    </div>
    <p className="mt-2 text-sm text-slate-600">Sandbox case. The sample video is private to staff.</p>
    {error && <Toast>{error}</Toast>}
    {busy && !evidence && <p role="status">Loading review details.</p>}
    {evidence && <form className="tt-form mt-4" onSubmit={publish}>
      <p><strong>Loan history</strong> {evidence.loan_history === 'found' ? `${evidence.facility_count} records returned` : 'No history returned'}</p>
      <p><strong>Sources</strong> {evidence.providers.join(', ')}</p>
      <a href={evidence.video_url} target="_blank" rel="noreferrer" className="underline text-blue-800">Open private sample video</a>
      <Button type="button" kind="secondary" disabled={busy} onClick={() => void load()}>Refresh video link</Button>
      <Button type="button" kind="secondary" disabled={busy} onClick={() => void previewReport()}>Preview factual report draft</Button>
      <Button type="button" kind="secondary" disabled={busy} onClick={() => void generateDraft()}>Analyse results with Gemini</Button>
      {!!evidence.loans?.length && <details><summary>Interswitch loan evidence</summary>
        <p>Provider-reported values. Amount units and duplicate records across bureaus require confirmation.</p>
        <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(evidence.loans, null, 2)}</pre>
      </details>}
      {draftNotice && <p role="status" className="text-sm">{draftNotice}</p>}
      {draft && <section aria-label="Report draft" className="space-y-3 rounded-lg border p-4">
        <h3 className="font-bold">Sample report draft</h3>
        <p className="text-sm">Review these findings before publication. Gemini is optional.</p>
        {draft.findings.map(finding => <div key={finding.id}>
          <h4 className="font-semibold">{finding.title}</h4>
          <p>{finding.text}</p>
        </div>)}
        {draft.analysis && <section aria-label="AI analysis for admin review" className="space-y-4">
          <h4 className="font-semibold">Analysis for your review</h4>
          {draft.analysis_model && <p className="text-sm">Drafted by {draft.analysis_model}. Not yet approved.</p>}
          <p className="text-sm">Edit any interpretation that needs correction. Changes clear your approval.</p>
          {(['summary', 'observations', 'concerns', 'missing_information', 'questions_for_admin'] as const).map(section => {
            const statements = section === 'summary' ? [draft.analysis!.summary] : draft.analysis![section];
            const labels = { summary: 'Executive summary', observations: 'Observations', concerns: 'Repayment concerns', missing_information: 'Missing information', questions_for_admin: 'Questions for review' };
            return <div key={section}><h5 className="font-semibold">{labels[section]}</h5>
              {statements.length === 0 && <p className="text-sm">No items raised.</p>}
              {statements.map((statement, index) => <div key={index}>
                <label className="sr-only" htmlFor={`analysis-${section}-${index}`}>{labels[section]} {index + 1}</label>
                <textarea id={`analysis-${section}-${index}`} value={statement.text} maxLength={1800}
                  onChange={event => {
                    const updated = { ...statement, text: event.target.value };
                    const analysis = { ...draft.analysis! };
                    if (section === 'summary') analysis.summary = updated;
                    else analysis[section] = analysis[section].map((item, position) => position === index ? updated : item);
                    setDraft({ ...draft, analysis }); setApproved(false);
                  }} />
                <p className="text-xs">Evidence: {statement.evidence.join(', ')}</p>
                {section !== 'summary' && <Button type="button" kind="secondary" disabled={busy}
                  onClick={() => {
                    const analysis = { ...draft.analysis! };
                    analysis[section] = analysis[section].filter((_, position) => position !== index);
                    setDraft({ ...draft, analysis }); setApproved(false);
                  }}>Remove this observation</Button>}
              </div>)}
            </div>;
          })}
        </section>}
        <h4 className="font-semibold">Follow-up</h4>
        <ul className="list-disc pl-5">{draft.follow_up.map(item => <li key={item}>{item}</li>)}</ul>
        <h4 className="font-semibold">Scope and limitations</h4>
        <ul className="list-disc pl-5">{draft.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        <label htmlFor="complete-report-note">Staff report note (visible to the landlord)</label>
        <textarea id="complete-report-note" maxLength={2000} value={draft.staff_note}
          onChange={event => { setDraft({ ...draft, staff_note: event.target.value }); setApproved(false); }} />
      </section>}
      <label htmlFor="complete-video-result">Video review</label>
      <select id="complete-video-result" name="video_review" required value={videoReview}
        onChange={event => { setVideoReview(event.target.value as typeof videoReview); setDraft(null); setApproved(false); setDraftNotice('Prepare the factual draft after changing the video outcome.'); }}>
        <option value="" disabled>Choose an outcome</option>
        <option value="reviewed">Video reviewed</option>
        <option value="needs_review">Video needs follow-up</option>
      </select>
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="font-semibold">Administrator's decision</legend>
        <p className="text-sm">Record your own decision and explain your reasons in paragraphs. Gemini does not fill in this section. This will be shown to the landlord.</p>
        <label htmlFor="complete-admin-decision">Decision recorded by you</label>
        <select id="complete-admin-decision" value={decision} required
          onChange={event => { setDecision(event.target.value); setApproved(false); }}>
          <option value="" disabled>Choose your decision</option>
          <option value="selected">Selected</option>
          <option value="not_selected">Not selected</option>
          <option value="further_information_required">Further information required</option>
        </select>
        <label htmlFor="complete-decision-reasons">Your reasons</label>
        <textarea id="complete-decision-reasons" value={decisionReasons} required minLength={20} maxLength={4000} rows={6}
          placeholder="Explain the decision you made, the evidence you considered, and any information that still needs clarification."
          onChange={event => { setDecisionReasons(event.target.value); setApproved(false); }} />
      </fieldset>
      <label><input type="checkbox" checked={approved} disabled={!draft || !videoReview || !decision || decisionReasons.trim().length < 20}
        onChange={event => setApproved(event.target.checked)} required /> I reviewed this report and approve publication.</label>
      <Button type="submit" loading={busy} disabled={!draft || !approved || !videoReview || !decision || decisionReasons.trim().length < 20}>Publish sandbox report</Button>
    </form>}
  </dialog>;
}
