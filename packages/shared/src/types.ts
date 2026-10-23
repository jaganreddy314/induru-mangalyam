// Public DTOs returned by the RPC layer. These are deliberately separate from database
// entities: each is a purpose-scoped projection (PRD §10).

export type Locale = 'te' | 'en';
export type MembershipStatus = 'APPLIED' | 'UNDER_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'DECLINED' | 'SUSPENDED';
export type CandidateStatus = 'DRAFT' | 'AWAITING_CONSENT' | 'UNDER_REVIEW' | 'ACTIVE' | 'PAUSED' | 'WITHDRAWN' | 'ARCHIVED';
export type MatchStatus = 'SUGGESTED' | 'INTEREST_PENDING' | 'AWAITING_CANDIDATE' | 'MUTUALLY_ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type IntroStage = 'PENDING_CONTACT' | 'INTRODUCED' | 'DISCUSSING' | 'MEETING_PLANNED' | 'CLOSED' | 'MATCH_CONFIRMED';
export type Visibility = 'HIDDEN' | 'MEMBERS' | 'BROKER_ONLY';
export type PhotoVisibility = 'GRANT_ONLY' | 'MEMBERS';
export type ConsentType = 'PARTICIPATE' | 'PUBLISH' | 'TRADITIONAL_DETAILS';
export type Capability = 'EDIT_BIODATA' | 'SUGGEST_INTEREST' | 'VIEW_INTERESTS' | 'COORDINATE_MEETINGS';
export type ContactField = 'FULL_NAME' | 'PHONE' | 'EMAIL' | 'PHOTO';
export type Relation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'SIBLING' | 'RELATIVE' | 'CANDIDATE';
export type CandidateRelationship = 'SON' | 'DAUGHTER' | 'SELF' | 'SIBLING' | 'WARD' | 'RELATIVE';
export type Gender = 'MALE' | 'FEMALE';
export type MaritalStatus = 'NEVER_MARRIED' | 'DIVORCED' | 'WIDOWED' | 'AWAITING_DIVORCE';
export type StaffRole = 'verifier' | 'broker' | 'moderator' | 'admin' | 'super_admin';
export type ReportCategory = 'IMPERSONATION' | 'PRESSURE' | 'HARASSMENT' | 'DATA_MISUSE' | 'FALSE_CLAIMS' | 'OTHER';
export type MeetingFormat = 'IN_PERSON' | 'PHONE_CALL' | 'VIDEO_EXTERNAL';

export interface SessionState {
  user: {
    id: string;
    display_name: string | null;
    phone: string | null;
    locale: Locale;
    status: 'ACTIVE' | 'RESTRICTED' | 'DEACTIVATED';
    notification_prefs: { muted: string[]; quiet_hours: { start: string; end: string } | null };
  };
  membership: { family_id: string; family_name: string; status: MembershipStatus; relation: Relation; can_invite: boolean } | null;
  own_candidate: { id: string; code: string; status: CandidateStatus } | null;
  staff_roles: StaffRole[];
  unread_notifications: number;
}

export interface Membership {
  family_id: string;
  family_code: string;
  family_name: string;
  district: string;
  hometown: string;
  status: MembershipStatus;
  applicant_message: string | null;
  relation: Relation;
  is_primary: boolean;
  can_invite: boolean;
  submitted_at: string;
  decided_at: string | null;
  case_id: string | null;
  evidence_count: number;
  members: { user_id: string; name: string | null; relation: Relation; is_primary: boolean; is_me: boolean }[];
}

export interface PublicCard {
  code: string;
  age?: number;
  gender?: Gender;
  height_cm?: number | null;
  marital_status?: MaritalStatus;
  education?: string | null;
  profession?: string | null;
  city?: string | null;
  district?: string | null;
  verified?: boolean;
  has_photo?: boolean;
  shortlisted?: boolean;
  unavailable?: boolean;
}

export interface ProfileDetail extends PublicCard {
  state: string | null;
  bio: string | null;
  family_summary: string | null;
  customs: Record<string, string> | null;
  preferences: { age_min: number | null; age_max: number | null; districts: string[]; open_to_relocation: boolean | null };
  member_since: string;
  checks: { phone_verified: boolean; family_verified: boolean; consent_confirmed: boolean; profile_reviewed: boolean };
  shortlist_note: string | null;
  open_match: { id: string; status: MatchStatus } | null;
}

export interface DiscoverPage {
  items: PublicCard[];
  next_cursor: string | null;
}

export interface DiscoverFilters {
  gender?: Gender;
  age_min?: number;
  age_max?: number;
  district?: string;
  city?: string;
  profession?: string;
  education?: string;
  marital_status?: MaritalStatus;
}

export interface FamilyCandidate {
  id: string;
  code: string;
  first_name: string;
  status: CandidateStatus;
  relationship: CandidateRelationship;
  age: number;
  claimed: boolean;
  is_owner: boolean;
  discoverable: boolean;
  suspended: boolean;
  my_capabilities: Capability[];
}

export interface CandidateDetails {
  first_name: string;
  gender: Gender;
  dob: string;
  height_cm: number | null;
  marital_status: MaritalStatus;
  education: string | null;
  profession: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  bio: string | null;
  family_summary: string | null;
  customs: Record<string, string>;
  photo_path: string | null;
  photo_approved: boolean;
}

export interface CandidateEdit {
  id: string;
  code: string;
  status: CandidateStatus;
  visibility: Visibility;
  photo_visibility: PhotoVisibility;
  version: number;
  is_owner: boolean;
  claimed: boolean;
  suspended: boolean;
  verified: boolean;
  relationship: CandidateRelationship;
  age: number;
  details: CandidateDetails;
  preferences: { age_min: number | null; age_max: number | null; districts: string[]; open_to_relocation: boolean | null; education: string | null; notes: string | null };
  contact: { full_name: string | null; phone: string | null; email: string | null } | null;
  consents: Partial<Record<ConsentType, true>>;
  my_capabilities: Capability[];
  family_permissions: { user_id: string; name: string | null; relation: Relation; capabilities: Capability[] }[] | null;
  pending_invitation: { phone_last4: string; expires_at: string } | null;
  review_message: string | null;
  discoverable: boolean;
}

export interface InterestRow {
  id: string;
  status: MatchStatus;
  side: 'SOURCE' | 'TARGET';
  via: 'FAMILY' | 'CANDIDATE' | 'BROKER';
  message: string | null;
  created_at: string;
  expires_at: string;
  my_candidate: { id: string; code: string; first_name: string };
  other: PublicCard;
  my_decision: 'ACCEPT' | 'DECLINE' | null;
  can_decide: boolean;
  introduction_id: string | null;
}

export interface IntroductionRow {
  id: string;
  stage: IntroStage;
  opened_at: string;
  updated_at: string;
  side: 'SOURCE' | 'TARGET';
  my_candidate: { id: string; code: string; first_name: string };
  other: PublicCard;
  has_broker: boolean;
}

export interface Meeting {
  id: string;
  start_at: string;
  timezone: string;
  format: MeetingFormat;
  location_hint: string | null;
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'RESCHEDULED';
  proposed_by_me: boolean;
  proposer_side: 'SOURCE' | 'TARGET' | 'BROKER';
}

export interface IntroductionDetail {
  id: string;
  stage: IntroStage;
  side: 'SOURCE' | 'TARGET';
  opened_at: string;
  introduced_at: string | null;
  closed_at: string | null;
  is_candidate: boolean;
  my_candidate: { id: string; code: string; first_name: string };
  other: PublicCard;
  broker: { name: string | null } | null;
  my_confirmed: boolean;
  can_coordinate: boolean;
  my_grants: { id: string; recipient_user_id: string; fields: ContactField[]; expires_at: string; granted_at: string; recipient_label: string }[];
  shared_with_me: { fields: ContactField[]; expires_at: string }[];
  possible_recipients: { user_id: string; relation: Relation }[] | null;
  meetings: Meeting[];
  timeline: { kind: string; by: 'ME' | 'OTHER' | 'BROKER' | 'SYSTEM'; at: string }[];
}

export interface SharedContact {
  grant_id: string;
  candidate_code: string;
  full_name?: string;
  phone?: string;
  email?: string;
  photo: boolean;
  expires_at: string;
}

export interface NotificationItem {
  id: string;
  template_key: string;
  payload: Record<string, string>;
  status: 'UNREAD' | 'READ';
  created_at: string;
}

export interface MyReport {
  id: string;
  category: ReportCategory;
  status: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED' | 'CLOSED';
  created_at: string;
  updated_at: string;
}
