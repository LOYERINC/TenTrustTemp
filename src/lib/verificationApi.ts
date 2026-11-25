import { supabase } from './supabase';
import { SCREENING_API_BASE } from './screeningApi';

export type Subject = 'tenant' | 'guarantor';

export type Purpose =
  | 'identity'
  | 'liveness'
  | 'employment'
  | 'address'
  | 'references'
  | 'guarantor'
  | 'summary_sharing';

export interface VerificationPolicy {
  version: string;
  retention_days: number;
  identity: string;
  liveness: string;
  credit_status: string;
  decision: string;
}

export interface CaseCreatePayload {
  tenant_first_name: string;
  monthly_rent_kobo: number;
  landlord_id?: string | null;
  property_id?: string | null;
}

export interface CaseCreateResult {
  caseId: string;
  status: string;
  expiresAt: string;
}

export interface ConsentPayload {
  subject_type?: Subject;
  granted: true;
  purposes: Purpose[];
  policy_version: string;
}

export interface IdentitySubmitPayload {
  subject_type?: Subject;
  bvn: string;
  nin: string;
  date_of_birth?: string;
}

export interface IdentityMethodsResponse {
  methods: Array<'phone' | 'phone_1' | 'email' | 'alternate_phone'>;
  expires_in_seconds?: number;
}

export interface OtpSendPayload {
  subject_type?: Subject;
  method: 'phone' | 'phone_1' | 'email' | 'alternate_phone';
  phone_number?: string;
}

export interface OtpVerifyPayload {
  subject_type?: Subject;
  otp: string;
}

export interface EvidenceFilePayload {
  content_base64: string;
  content_type: 'image/jpeg' | 'image/png' | 'application/pdf';
}

export interface LivenessPayload {
  subject_type?: Subject;
  selfie: EvidenceFilePayload;
}

export interface EmploymentPayload {
  subject_type?: Subject;
  employer_name: string;
  job_title: string;
  employment_type: 'employed' | 'self_employed';
  monthly_income_kobo: number;
  document: EvidenceFilePayload;
  cac_number?: string | null;
}

export interface AddressPayload {
  address_text: string;
  proof_type: 'utility_bill' | 'tenancy_agreement' | 'other';
  proof: EvidenceFilePayload;
}

export interface ReferencePayload {
  type: 'previous_landlord' | 'personal' | 'professional';
  name: string;
  phone: string;
  email?: string | null;
}

export interface GuarantorInvitePayload {
  full_name: string;
  phone: string;
  email: string;
  relationship: string;
}

export interface GuarantorInviteResult {
  id: string;
  invitation: string;
  expiresAt: string;
}

export interface CheckSummary {
  name: string;
  status: string;
}

export interface LandlordSummary {
  caseId: string;
  tenantFirstName: string;
  overallResult: 'pass' | 'review' | 'fail' | 'pending';
  checks: CheckSummary[];
  reasons: string[];
  verifiedAt: string | null;
}

export interface VerificationIssue {
  field?: string;
  message: string;
}

export interface VerificationErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: VerificationIssue[];
  };
}

export class VerificationApiError extends Error {
  code: string;
  status: number;
  fields?: VerificationIssue[];

  constructor(message: string, status: number, code = 'unknown_error', fields?: VerificationIssue[]) {
    super(message);
    this.name = 'VerificationApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Universal verification API fetcher
 */
export async function verificationApi<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
  customHeaders?: Record<string, string>
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (customHeaders) {
    Object.entries(customHeaders).forEach(([k, v]) => {
      headers.set(k, v);
    });
  }

  if (requireAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new VerificationApiError(
        'Please sign in to continue verification.',
        401,
        'unauthorized'
      );
    }
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const url = `${SCREENING_API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new VerificationApiError(
      'The verification service is temporarily unavailable. Please try again shortly.',
      0,
      'network_error'
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errBody = body as VerificationErrorResponse;
    const msg = errBody?.error?.message || (typeof body?.detail === 'string' ? body.detail : 'Verification request could not be completed.');
    const code = errBody?.error?.code || `http_${response.status}`;
    const fields = errBody?.error?.fields;
    throw new VerificationApiError(msg, response.status, code, fields);
  }

  return body as T;
}

// ─── Verification Client Methods ──────────────────────────────────────────────

export async function getVerificationPolicy(): Promise<VerificationPolicy> {
  return verificationApi<VerificationPolicy>('/api/v1/verification-policy', {}, false);
}

export async function createVerificationCase(payload: CaseCreatePayload): Promise<CaseCreateResult> {
  return verificationApi<CaseCreateResult>('/api/v1/verification-cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitConsent(caseId: string, payload: ConsentPayload): Promise<{ consent_recorded: boolean }> {
  return verificationApi<{ consent_recorded: boolean }>(`/api/v1/verification-cases/${caseId}/consent`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      granted: true,
      purposes: payload.purposes,
      policy_version: payload.policy_version,
    }),
  });
}

export async function revokeConsent(caseId: string, subjectType: Subject = 'tenant'): Promise<{ revoked: boolean }> {
  return verificationApi<{ revoked: boolean }>(`/api/v1/verification-cases/${caseId}/consent/revoke`, {
    method: 'POST',
    body: JSON.stringify({ subject_type: subjectType }),
  });
}

export async function submitIdentity(caseId: string, payload: IdentitySubmitPayload): Promise<IdentityMethodsResponse> {
  return verificationApi<IdentityMethodsResponse>(`/api/v1/verification-cases/${caseId}/identity`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      bvn: payload.bvn,
      nin: payload.nin,
      ...(payload.date_of_birth ? { date_of_birth: payload.date_of_birth } : {}),
    }),
  });
}

export async function sendIdentityOtp(caseId: string, payload: OtpSendPayload): Promise<{ sent: boolean }> {
  return verificationApi<{ sent: boolean }>(`/api/v1/verification-cases/${caseId}/identity/otp/send`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      method: payload.method,
      ...(payload.phone_number ? { phone_number: payload.phone_number } : {}),
    }),
  });
}

export async function verifyIdentityOtp(caseId: string, payload: OtpVerifyPayload): Promise<{ verified: boolean; match_status?: string }> {
  return verificationApi<{ verified: boolean; match_status?: string }>(`/api/v1/verification-cases/${caseId}/identity/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      otp: payload.otp,
    }),
  });
}

export async function submitLiveness(caseId: string, payload: LivenessPayload): Promise<{ status: string }> {
  return verificationApi<{ status: string }>(`/api/v1/verification-cases/${caseId}/liveness`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      selfie: payload.selfie,
    }),
  });
}

export async function submitEmployment(caseId: string, payload: EmploymentPayload): Promise<{ id: string; status: string }> {
  return verificationApi<{ id: string; status: string }>(`/api/v1/verification-cases/${caseId}/employment`, {
    method: 'POST',
    body: JSON.stringify({
      subject_type: payload.subject_type || 'tenant',
      employer_name: payload.employer_name,
      job_title: payload.job_title,
      employment_type: payload.employment_type,
      monthly_income_kobo: payload.monthly_income_kobo,
      document: payload.document,
      ...(payload.cac_number ? { cac_number: payload.cac_number } : {}),
    }),
  });
}

export async function submitAddress(caseId: string, payload: AddressPayload): Promise<{ id: string; status: string }> {
  return verificationApi<{ id: string; status: string }>(`/api/v1/verification-cases/${caseId}/address`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitReference(caseId: string, payload: ReferencePayload): Promise<{ id: string; status: string }> {
  return verificationApi<{ id: string; status: string }>(`/api/v1/verification-cases/${caseId}/references`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function inviteGuarantor(caseId: string, payload: GuarantorInvitePayload): Promise<GuarantorInviteResult> {
  return verificationApi<GuarantorInviteResult>(`/api/v1/verification-cases/${caseId}/guarantor`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function acceptGuarantorInvite(caseId: string, invitation: string): Promise<{ accepted: boolean; next_step: string }> {
  return verificationApi<{ accepted: boolean; next_step: string }>(`/api/v1/verification-cases/${caseId}/guarantor/accept`, {
    method: 'POST',
    body: JSON.stringify({ invitation }),
  });
}

export async function getCaseSummary(caseId: string, subjectType: Subject = 'tenant'): Promise<LandlordSummary> {
  return verificationApi<LandlordSummary>(`/api/v1/verification-cases/${caseId}?subject_type=${subjectType}`);
}

export async function submitDispute(caseId: string, reason: string): Promise<{ id: string; status: string }> {
  return verificationApi<{ id: string; status: string }>(`/api/v1/verification-cases/${caseId}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function getLandlordSummary(caseId: string): Promise<LandlordSummary> {
  return verificationApi<LandlordSummary>(`/api/v1/landlord/verification-cases/${caseId}/summary`);
}

// ─── Helper for converting file to base64 ─────────────────────────────────────

export function fileToBase64(file: File): Promise<{ base64: string; contentType: 'image/jpeg' | 'image/png' | 'application/pdf' }> {
  return new Promise((resolve, reject) => {
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return reject(new Error('Only JPEG, PNG images and PDF documents are supported.'));
    }
    if (file.size > 5 * 1024 * 1024) {
      return reject(new Error('File size exceeds the 5 MB limit. Please select a smaller file.'));
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) {
        return reject(new Error('Failed to encode file content.'));
      }
      resolve({
        base64,
        contentType: file.type as 'image/jpeg' | 'image/png' | 'application/pdf',
      });
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export function formatVerificationError(error: unknown): string {
  if (error instanceof VerificationApiError) {
    if (error.fields && error.fields.length > 0) {
      return `${error.message}: ${error.fields.map(f => `${f.field || 'Item'}: ${f.message}`).join(', ')}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

// ─── Reviewer Admin Methods ───────────────────────────────────────────────────

export interface AdminCaseItem {
  id: string;
  status: string;
  overall_result: string;
  score: number;
  created_at: string;
  expires_at: string;
}

export interface AdminQueueResponse {
  items: AdminCaseItem[];
}

export interface AdminEvidenceResponse {
  identity: Array<{
    id: string;
    subject_type: Subject;
    status: string;
    name_match_score?: number | null;
    dob_match?: boolean | null;
    phone_match?: boolean | null;
    duplicate_review_required?: boolean;
    reference_photo_available?: boolean;
    name_bvn?: string | null;
    name_nin?: string | null;
  }>;
  liveness: Array<{
    id: string;
    subject_type: Subject;
    status: string;
    selfie_url?: string | null;
  }>;
  employment: Array<{
    id: string;
    subject_id: string;
    subject_type: Subject;
    employer_name?: string | null;
    job_title?: string | null;
    employment_type?: string;
    monthly_income_kobo?: number;
    verification_status?: string;
    document_url?: string | null;
    cac_number?: string | null;
  }>;
  address: Array<{
    id: string;
    address_text?: string | null;
    proof_type?: string;
    verification_status?: string;
    proof_url?: string | null;
  }>;
  references: Array<{
    id: string;
    type?: string;
    status?: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  }>;
  disputes: Array<{
    id: string;
    subject_id: string;
    reason?: string | null;
  }>;
}

export async function getAdminVerificationCases(
  status = 'needs_review',
  limit = 25,
  offset = 0,
  reason = 'Admin reviewer checking pending verification cases'
): Promise<AdminQueueResponse> {
  const query = new URLSearchParams({
    status,
    limit: String(limit),
    offset: String(offset),
  });
  return verificationApi<AdminQueueResponse>(
    `/api/v1/admin/verification-cases?${query}`,
    {},
    true,
    { 'X-Review-Reason': reason }
  );
}

export async function getAdminCaseEvidence(
  caseId: string,
  reason = 'Reviewing submitted tenant verification evidence'
): Promise<AdminEvidenceResponse> {
  return verificationApi<AdminEvidenceResponse>(
    `/api/v1/admin/verification-cases/${caseId}/evidence`,
    {},
    true,
    { 'X-Review-Reason': reason }
  );
}

export async function submitAdminLivenessDecision(
  caseId: string,
  checkId: string,
  payload: { status: 'passed' | 'failed' | 'manual_review'; match_score?: number; reason: string }
): Promise<any> {
  return verificationApi(
    `/api/v1/admin/verification-cases/${caseId}/liveness/${checkId}/decision`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitAdminEmploymentDecision(
  caseId: string,
  payload: {
    subject_type?: Subject;
    subject_id?: string;
    verification_status: 'verified' | 'failed' | 'unverified';
    verification_method: 'hr_call' | 'hr_email' | 'document' | 'other';
    reason: string;
  }
): Promise<any> {
  return verificationApi(
    `/api/v1/admin/verification-cases/${caseId}/employment/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitAdminAddressDecision(
  caseId: string,
  addressId: string,
  payload: { status: 'verified' | 'failed'; reason: string }
): Promise<any> {
  return verificationApi(
    `/api/v1/admin/verification-cases/${caseId}/address/${addressId}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitAdminFinalDecision(
  caseId: string,
  payload: { result: 'pass' | 'review' | 'fail'; reason: string }
): Promise<any> {
  return verificationApi(
    `/api/v1/admin/verification-cases/${caseId}/decision`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}
