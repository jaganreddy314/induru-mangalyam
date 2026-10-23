# API contract

All endpoints are Supabase RPCs: `POST /rest/v1/rpc/<name>` with the user's JWT
(`supabase.rpc(name, args)`). The anon role can call nothing. Every request should carry an
`x-request-id` header (the shared client adds one); it is stored on every audit event.

## Errors

Raised errors arrive as `{ code: "P0001", message: <CODE>, hint: <human text>, details: <json> }`.
Denials that must be audited even though the operation fails are *returned* as
`{ "error": <CODE>, "message": <hint> }` with HTTP 200 (a raised error would roll back the audit
row). `packages/shared/src/api.ts` turns both into `ApiError { code, hint }`.

| Code | Meaning |
|---|---|
| `UNAUTHENTICATED` | No valid session |
| `PROFILE_NOT_INITIALISED` | `ensure_profile` not yet called |
| `ACCOUNT_RESTRICTED` | User restricted by moderation |
| `FORBIDDEN` | Caller lacks scope for this object |
| `MFA_REQUIRED` | Staff call without `aal2` |
| `REAUTH_REQUIRED` | Step-up: OTP older than `fresh_auth_minutes` |
| `MEMBERSHIP_PENDING` | Family not approved |
| `CONSENT_REQUIRED` | Candidate consent / eligibility missing, or stage needs candidate action |
| `PROFILE_PRIVATE` | Target not visible to caller (never distinguishes "doesn't exist") |
| `UNAUTHORISED_RECIPIENT` | Contact grant recipient not on the other side |
| `INVALID_STATE` | State machine forbids the transition |
| `RATE_LIMITED` | Per-user bucket exhausted (`app.config` `rate_*`) |
| `VALIDATION` | Bad input (`details.field` when applicable) |
| `AGE_INELIGIBLE` | Below configured legal minimum age |
| `STALE_VERSION` | Profile changed during consent review |
| `INVITATION_EXPIRED`, `INVITATION_PHONE_MISMATCH`, `EVIDENCE_EXPIRED`, `NOT_FOUND` | As named |

## Member RPCs (PWA)

| RPC | PRD route | Who | Notes |
|---|---|---|---|
| `ensure_profile(p_locale)` / `get_session_state()` | — | any signed-in | Creates `app.users`; returns membership, own candidate, staff roles, unread count |
| `set_preferences(p_locale, p_display_name, p_notification_prefs)` | M02, M20 | self | |
| `apply_membership(p)` | POST /membership/apply | signed-in | Idempotent; always `APPLIED` |
| `get_my_membership()` | GET /membership/me | member/applicant | |
| `update_membership_application(p)` | M06 | primary applicant | `NEEDS_INFO → UNDER_REVIEW` |
| `register_evidence(case, type, path)` | M05 | own family case | Path must be `<case_id>/…` in `evidence` bucket |
| `create_family_invitation(phone, relation)` | POST /families/{id}/invitations | approved member with `can_invite` | Returns one-time token (hash stored) |
| `get_invitation(token)` / `accept_invitation(token)` | M09 | invitee's own phone | Inviter can never accept |
| `create_candidate_draft(p)` | POST /candidates | approved family | `DRAFT` (or `AWAITING_CONSENT` for SELF); never searchable |
| `update_candidate_details / _preferences(id, p)` | M08 | `EDIT_BIODATA` | Material edits on live profile → `UNDER_REVIEW` |
| `update_candidate_contact(id, p)` | M11 | candidate only | |
| `set_candidate_photo(id, path)` | M08 | `EDIT_BIODATA` | Resets staff photo approval |
| `get_candidate_for_edit(id)` / `list_family_candidates()` | M07, M21 | own family | Contact only to owner |
| `create_candidate_invitation(id, phone)` | M09 | approved family | Phone ≠ inviter's |
| `record_candidate_consents(id, consents, permissions, version)` | POST /candidates/{id}/consents | candidate, **fresh auth** | Versioned evidence; age gate |
| `set_family_permissions(id, list)` | M10/M11 | candidate | Revocation immediate |
| `update_privacy(id, p)` | PATCH /candidates/{id}/privacy | candidate only | Visibility, photo audience |
| `pause_candidate / resume_candidate(id)` | M11 | candidate | |
| `withdraw_candidate(id, delete)` | M11 | candidate, **fresh auth** | Hides, revokes consents/delegations/grants, closes intros |
| `discover(filters, cursor, limit)` | GET /discover | approved family | Safe projection, cursor, rate-limited |
| `get_profile(code)` / `get_profile_photo_path(code)` | M13 | approved family | Rate-limited; failed guesses count |
| `save_shortlist / remove_shortlist / list_shortlist` | POST /shortlists | approved family | Never notifies target |
| `block_profile(code)` | M13 | approved family | Bidirectional hide |
| `send_interest(source, target_code, message)` | POST /matches/interests | `SUGGEST_INTEREST` | Candidate-initiated → awaiting target; family-initiated → needs source confirm |
| `decide_match(id, decision)` | POST /matches/{id}/decisions | **that side's candidate account only** | Mutual → introduction |
| `list_interests(box)` | M16 | `VIEW_INTERESTS` | Target never sees unconfirmed family proposals |
| `list_introductions / get_introduction(id)` | M17 | participants | No hidden states of the other side |
| `grant_contact(intro, recipient, fields, days)` | POST /introductions/{id}/contact-grants | grantor candidate, **fresh auth** | One row per recipient; audited |
| `revoke_contact_grant(id)` | M18 | grantor | |
| `get_introduction_contacts(intro)` | M18 | recipient | Only granted fields; every read audited |
| `mark_discussing / close_introduction / confirm_match` | M17 | participants / candidates | |
| `propose_meeting(...)` / `respond_meeting(id, r)` | POST /introductions/{id}/meetings | `COORDINATE_MEETINGS` or assigned broker | Idempotency key |
| `list_notifications / mark_notifications_read` | M20 | self | Template key + opaque ids only |
| `file_report(...)` / `list_my_reports()` | POST /reports | signed-in | Urgent self-pause |
| `request_data_action(scope, candidate)` / `leave_family()` | M21 | self | |

## Staff RPCs (admin) — all require a staff role **and** `aal2`

| RPC | Screen | Roles |
|---|---|---|
| `admin_overview` | A01 | any staff |
| `admin_list_membership_queue`, `admin_get_family` | A02, A03 | verifier, admin (+moderator for family) |
| `admin_assign_case(case, reviewer)` | A02/A05 | verifier (self), admin (anyone) |
| `admin_decide_membership(...)` | A02 | **assigned reviewer** |
| `admin_mark_referral`, `admin_review_evidence` | A05 | verifier/admin; evidence review = assigned reviewer |
| `admin_open_evidence(id)` | A05 | **assigned reviewer of an open case**; denials audited |
| `admin_purge_expired_evidence` | A10 | admin |
| `admin_list_candidate_queue`, `admin_get_candidate` | A04 | verifier, admin, moderator (+broker for view) |
| `admin_decide_candidate(...)` | A04 | assigned reviewer; activation only if all I1 gates pass |
| `admin_set_candidate_suspension`, `admin_set_user_restriction`, `admin_set_family_suspension` | A04/A08 | moderator, admin |
| `admin_matchmaking_search`, `admin_suggest_match` | A06 | broker, admin |
| `admin_list_introductions`, `admin_get_introduction` | A07 | broker, admin; notes only for assigned broker/admin |
| `admin_assign_broker`, `admin_set_intro_stage`, `admin_add_broker_note` | A07 | assigned broker / admin; consent stages blocked + audited |
| `admin_list_support`, `admin_get_support_case`, `admin_update_support` | A08 | moderator, admin |
| `admin_list_audit` | A09 | admin; the read itself is audited |
| `admin_list_role_assignments`, `admin_grant_role`, `admin_revoke_role`, `admin_update_config` | A10 | super_admin |
| `admin_get_config`, `admin_list_data_requests`, `admin_update_data_request` | A10 | admin |
