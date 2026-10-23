// Typed client for the member RPCs. Query keys are centralised so mutations can
// invalidate exactly what they change.
import { rpc, type CandidateEdit, type DiscoverFilters, type DiscoverPage, type FamilyCandidate, type InterestRow,
  type IntroductionDetail, type IntroductionRow, type Membership, type MyReport, type NotificationItem, type ProfileDetail,
  type PublicCard, type SessionState, type ConsentType, type Capability, type ContactField, type SharedContact,
  type Locale, type Visibility, type PhotoVisibility, type MeetingFormat, type ReportCategory, type Relation } from '@induru/shared';

export const qk = {
  session: ['session'] as const,
  membership: ['membership'] as const,
  familyCandidates: ['family-candidates'] as const,
  candidate: (id: string) => ['candidate', id] as const,
  discover: (f: DiscoverFilters) => ['discover', f] as const,
  profile: (code: string) => ['profile', code] as const,
  shortlist: ['shortlist'] as const,
  interests: (box: string) => ['interests', box] as const,
  introductions: ['introductions'] as const,
  introduction: (id: string) => ['introduction', id] as const,
  notifications: ['notifications'] as const,
  reports: ['reports'] as const,
};

export const api = {
  ensureProfile: (locale?: Locale) => rpc<SessionState>('ensure_profile', { p_locale: locale ?? null }),
  sessionState: () => rpc<SessionState>('get_session_state'),
  setPreferences: (p: { locale?: Locale; displayName?: string; notificationPrefs?: SessionState['user']['notification_prefs'] }) =>
    rpc<void>('set_preferences', { p_locale: p.locale ?? null, p_display_name: p.displayName ?? null, p_notification_prefs: p.notificationPrefs ?? null }),

  // Membership
  applyMembership: (p: Record<string, unknown>) => rpc<Membership>('apply_membership', { p }),
  myMembership: () => rpc<Membership | null>('get_my_membership'),
  updateMembership: (p: Record<string, unknown>) => rpc<Membership>('update_membership_application', { p }),
  registerEvidence: (caseId: string, type: string, path: string) =>
    rpc<string>('register_evidence', { p_case_id: caseId, p_type: type, p_storage_path: path }),
  createFamilyInvitation: (phone: string, relation: Relation) =>
    rpc<{ invitation_id: string; token: string }>('create_family_invitation', { p_phone: phone, p_relation: relation }),
  getInvitation: (token: string) =>
    rpc<{ kind: 'FAMILY_MEMBER' | 'CANDIDATE'; family_name: string; relation: string | null; expired: boolean; used: boolean; phone_matches: boolean }>('get_invitation', { p_token: token }),
  acceptInvitation: (token: string) => rpc<{ kind: string; candidate_id: string | null }>('accept_invitation', { p_token: token }),
  leaveFamily: () => rpc<void>('leave_family'),

  // Candidates
  familyCandidates: () => rpc<FamilyCandidate[]>('list_family_candidates'),
  createDraft: (p: Record<string, unknown>) => rpc<{ candidate_id: string }>('create_candidate_draft', { p }),
  candidate: (id: string) => rpc<CandidateEdit>('get_candidate_for_edit', { p_candidate: id }),
  updateDetails: (id: string, p: Record<string, unknown>) => rpc<CandidateEdit>('update_candidate_details', { p_candidate: id, p }),
  updatePreferences: (id: string, p: Record<string, unknown>) => rpc<void>('update_candidate_preferences', { p_candidate: id, p }),
  updateContact: (id: string, p: Record<string, unknown>) => rpc<void>('update_candidate_contact', { p_candidate: id, p }),
  setPhoto: (id: string, path: string | null) => rpc<void>('set_candidate_photo', { p_candidate: id, p_storage_path: path }),
  createCandidateInvitation: (id: string, phone: string) =>
    rpc<{ invitation_id: string; token: string }>('create_candidate_invitation', { p_candidate: id, p_phone: phone }),
  recordConsents: (id: string, consents: Partial<Record<ConsentType, boolean>>, permissions: { user_id: string; capabilities: Capability[] }[] | null, version?: number) =>
    rpc<CandidateEdit>('record_candidate_consents', { p_candidate: id, p_consents: consents, p_permissions: permissions, p_reviewed_version: version ?? null }),
  setFamilyPermissions: (id: string, permissions: { user_id: string; capabilities: Capability[] }[]) =>
    rpc<void>('set_family_permissions', { p_candidate: id, p_permissions: permissions }),
  updatePrivacy: (id: string, p: { visibility?: Visibility; photo_visibility?: PhotoVisibility }) =>
    rpc<CandidateEdit>('update_privacy', { p_candidate: id, p }),
  pause: (id: string) => rpc<CandidateEdit>('pause_candidate', { p_candidate: id }),
  resume: (id: string) => rpc<CandidateEdit>('resume_candidate', { p_candidate: id }),
  withdraw: (id: string, requestDeletion: boolean) => rpc<void>('withdraw_candidate', { p_candidate: id, p_request_deletion: requestDeletion }),

  // Discovery
  discover: (filters: DiscoverFilters, cursor: string | null) => rpc<DiscoverPage>('discover', { p_filters: filters, p_cursor: cursor, p_limit: 20 }),
  profile: (code: string) => rpc<ProfileDetail>('get_profile', { p_code: code }),
  photoPath: (code: string) => rpc<string | null>('get_profile_photo_path', { p_code: code }),
  saveShortlist: (code: string, note?: string) => rpc<void>('save_shortlist', { p_code: code, p_note: note ?? null }),
  removeShortlist: (code: string) => rpc<void>('remove_shortlist', { p_code: code }),
  shortlist: () => rpc<(PublicCard & { note: string | null; saved_at: string })[]>('list_shortlist'),
  block: (code: string) => rpc<void>('block_profile', { p_code: code }),

  // Interests
  sendInterest: (sourceCandidate: string, targetCode: string, message?: string) =>
    rpc<{ match_id: string; duplicate: boolean }>('send_interest', { p_source_candidate: sourceCandidate, p_target_code: targetCode, p_message: message || null }),
  decide: (matchId: string, decision: 'ACCEPT' | 'DECLINE') =>
    rpc<{ status: string; introduction_id?: string }>('decide_match', { p_match: matchId, p_decision: decision }),
  interests: (box: 'RECEIVED' | 'SENT' | 'CLOSED') => rpc<InterestRow[]>('list_interests', { p_box: box }),

  // Introductions
  introductions: () => rpc<IntroductionRow[]>('list_introductions'),
  introduction: (id: string) => rpc<IntroductionDetail>('get_introduction', { p_intro: id }),
  grantContact: (id: string, recipient: string, fields: ContactField[], days: number) =>
    rpc<{ grant_id: string }>('grant_contact', { p_intro: id, p_recipient: recipient, p_fields: fields, p_expires_in_days: days }),
  revokeGrant: (grantId: string) => rpc<void>('revoke_contact_grant', { p_grant: grantId }),
  contacts: (id: string) => rpc<SharedContact[]>('get_introduction_contacts', { p_intro: id }),
  markDiscussing: (id: string) => rpc<void>('mark_discussing', { p_intro: id }),
  closeIntroduction: (id: string) => rpc<void>('close_introduction', { p_intro: id }),
  confirmMatch: (id: string) => rpc<{ stage: string }>('confirm_match', { p_intro: id }),
  proposeMeeting: (p: { intro: string; startAt: string; timezone: string; format: MeetingFormat; locationHint: string; key: string; replaces?: string }) =>
    rpc<string>('propose_meeting', { p_intro: p.intro, p_start_at: p.startAt, p_timezone: p.timezone, p_format: p.format,
      p_location_hint: p.locationHint, p_idempotency_key: p.key, p_replaces: p.replaces ?? null }),
  respondMeeting: (id: string, response: 'ACCEPT' | 'DECLINE' | 'CANCEL') => rpc<void>('respond_meeting', { p_meeting: id, p_response: response }),

  // Notifications, help, data
  notifications: () => rpc<NotificationItem[]>('list_notifications', { p_before: null, p_limit: 50 }),
  markRead: (ids?: string[]) => rpc<void>('mark_notifications_read', { p_ids: ids ?? null }),
  fileReport: (p: { category: ReportCategory; description: string; relatedCode?: string; introduction?: string; urgent: boolean; pauseMe: boolean }) =>
    rpc<string>('file_report', { p_category: p.category, p_description: p.description, p_related_code: p.relatedCode || null,
      p_introduction: p.introduction ?? null, p_urgent: p.urgent, p_pause_my_profile: p.pauseMe }),
  myReports: () => rpc<MyReport[]>('list_my_reports'),
  requestData: (scope: 'ACCOUNT' | 'CANDIDATE' | 'EXPORT', candidate?: string) =>
    rpc<string | null>('request_data_action', { p_scope: scope, p_candidate: candidate ?? null }),
};
