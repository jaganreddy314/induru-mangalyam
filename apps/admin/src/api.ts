// Staff RPC client. All projections are purpose-scoped server side; nothing here
// can reach contact values or unassigned evidence.
import { rpc, getSupabase } from '@induru/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export const adminApi = {
  overview: () => rpc<Record<string, number>>('admin_overview'),
  staffUsers: (role?: string) => rpc<{ user_id: string; name: string | null }[]>('admin_list_staff_users', { p_role: role ?? null }),

  membershipQueue: (status?: string) => rpc<Row[]>('admin_list_membership_queue', { p_status: status ?? null }),
  family: (id: string) => rpc<Row>('admin_get_family', { p_family: id }),
  assignCase: (caseId: string, reviewer?: string) => rpc<void>('admin_assign_case', { p_case: caseId, p_reviewer: reviewer ?? null }),
  decideMembership: (familyId: string, decision: string, message: string, notes: string, checklist: Row) =>
    rpc<void>('admin_decide_membership', { p_family: familyId, p_decision: decision, p_applicant_message: message || null, p_internal_notes: notes || null, p_checklist: checklist }),
  markReferral: (id: string, status: string, notes?: string) => rpc<void>('admin_mark_referral', { p_referral: id, p_status: status, p_notes: notes ?? null }),
  openEvidence: (id: string) => rpc<{ storage_path: string; type: string }>('admin_open_evidence', { p_evidence: id }),
  reviewEvidence: (id: string, status: string) => rpc<void>('admin_review_evidence', { p_evidence: id, p_status: status }),
  purgeEvidence: () => rpc<string[]>('admin_purge_expired_evidence'),
  setFamilySuspension: (id: string, suspend: boolean, reason: string) => rpc<void>('admin_set_family_suspension', { p_family: id, p_suspend: suspend, p_reason: reason }),

  candidateQueue: (status: string) => rpc<Row[]>('admin_list_candidate_queue', { p_status: status }),
  candidate: (id: string) => rpc<Row>('admin_get_candidate', { p_candidate: id }),
  decideCandidate: (id: string, decision: string, message: string, photoApproved: boolean | null, checklist: Row) =>
    rpc<Row>('admin_decide_candidate', { p_candidate: id, p_decision: decision, p_message: message || null, p_photo_approved: photoApproved, p_checklist: checklist }),
  setCandidateSuspension: (id: string, suspend: boolean, reason: string) => rpc<void>('admin_set_candidate_suspension', { p_candidate: id, p_suspend: suspend, p_reason: reason }),
  setUserRestriction: (id: string, restrict: boolean, reason: string) => rpc<void>('admin_set_user_restriction', { p_user: id, p_restrict: restrict, p_reason: reason }),

  matchSearch: (filters: Row, forCandidate?: string) => rpc<Row[]>('admin_matchmaking_search', { p_filters: filters, p_for_candidate: forCandidate ?? null }),
  suggestMatch: (source: string, target: string, rationale: string) => rpc<{ match_id: string; duplicate: boolean }>('admin_suggest_match', { p_source: source, p_target: target, p_rationale: rationale }),

  introductions: (stage?: string, mine?: boolean) => rpc<Row[]>('admin_list_introductions', { p_stage: stage ?? null, p_mine: !!mine }),
  introduction: (id: string) => rpc<Row>('admin_get_introduction', { p_intro: id }),
  assignBroker: (id: string, broker: string) => rpc<void>('admin_assign_broker', { p_intro: id, p_broker: broker }),
  setStage: (id: string, stage: string, reason?: string) => rpc<Row>('admin_set_intro_stage', { p_intro: id, p_stage: stage, p_reason: reason ?? null }),
  addNote: (id: string, body: string, scope: string) => rpc<void>('admin_add_broker_note', { p_intro: id, p_body: body, p_scope: scope }),
  proposeMeeting: (intro: string, startAt: string, format: string, hint: string, key: string) =>
    rpc<string>('propose_meeting', { p_intro: intro, p_start_at: startAt, p_timezone: 'Asia/Kolkata', p_format: format, p_location_hint: hint, p_idempotency_key: key, p_replaces: null }),

  support: (status?: string) => rpc<Row[]>('admin_list_support', { p_status: status ?? null }),
  supportCase: (id: string) => rpc<Row>('admin_get_support_case', { p_case: id }),
  updateSupport: (id: string, p: Row) => rpc<void>('admin_update_support', { p_case: id, p }),

  audit: (filters: Row, before?: string) => rpc<Row[]>('admin_list_audit', { p_filters: filters, p_before: before ?? null, p_limit: 100 }),

  roles: () => rpc<Row[]>('admin_list_role_assignments'),
  grantRole: (phone: string, role: string) => rpc<string>('admin_grant_role', { p_phone: phone, p_role: role, p_scope_type: 'GLOBAL', p_scope_id: null }),
  revokeRole: (id: string) => rpc<void>('admin_revoke_role', { p_assignment: id }),
  config: () => rpc<Record<string, unknown>>('admin_get_config'),
  updateConfig: (key: string, value: unknown) => rpc<void>('admin_update_config', { p_key: key, p_value: value }),
  dataRequests: () => rpc<Row[]>('admin_list_data_requests'),
  updateDataRequest: (id: string, status: string, exceptions?: string) => rpc<void>('admin_update_data_request', { p_request: id, p_status: status, p_exceptions: exceptions ?? null }),
};

/** Removes purged evidence objects (allowed by storage policy only once the row is marked deleted). */
export async function removeEvidenceObjects(paths: string[]) {
  if (!paths.length) return;
  const { error } = await getSupabase().storage.from('evidence').remove(paths);
  if (error) throw error;
}

export async function signedUrl(bucket: 'evidence' | 'photos', path: string) {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
