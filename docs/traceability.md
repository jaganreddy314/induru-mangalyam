# Requirement traceability

Status: ✅ implemented & tested · 🟢 implemented (UI / not automatically tested) · 🟡 partial · ⛔ not done.
DB tests: `tests/db/acceptance.test.js` (test names quoted).

## PRD §15 acceptance scenarios

| Scenario | Status | Where | Test |
|---|---|---|---|
| Parent submits application → pending only, no discovery | ✅ | `apply_membership`, `require_approved_family` | "parent submits application…" |
| Parent creates candidate profile → DRAFT, never searchable | ✅ | `create_candidate_draft`, `is_discoverable` | "parent-created profile stays DRAFT…" |
| Parent clicks publish → rejected without candidate consent | ✅ | `update_privacy`, `record_candidate_consents`, `admin_decide_candidate` | "parent cannot publish or consent…", "staff cannot verify without candidate consent" |
| Candidate denies consent → invisible, no outbound interest | ✅ | `send_interest` eligibility check | "candidate denies consent…" |
| Candidate revokes parent permission → forbidden immediately | ✅ | `can_act_for`, `set_family_permissions` | "candidate revokes parent permission…" |
| Unverified user calls discover → 403, no data | ✅ | `discover` | "unverified user calls discover…" |
| Member enumerates profiles → projection, pagination, rate limit | ✅ | `discover`, `get_profile`, `rate_limit` | "results are a safe projection…", "own family… rate limited" |
| One side accepts → no contact, no introduction | ✅ | `decide_match` | "one side accepts…" |
| Both approvals → contact step, no auto reveal | ✅ | `decide_match`, `get_introduction_contacts` | "both approvals…" |
| Grant only email to specific recipient → only that readable | ✅ | `grant_contact`, `get_introduction_contacts` | "candidate grants only email…" |
| Revoke contact grant → retrieval blocked, audited | ✅ | `revoke_contact_grant` | "candidate revokes contact grant…" |
| Broker bypasses approval → blocked, audited | ✅ | `decide_match`, `admin_set_intro_stage` | "broker suggestion still needs both candidates…" |
| Candidate pauses/withdraws → gone from search/recommendations | ✅ | `pause_candidate`, `withdraw_candidate`, `is_discoverable` | "candidate pauses or withdraws…" |
| Verifier opens unrelated document → denied, logged | ✅ | `admin_open_evidence`, storage policy | "verifier opening unrelated evidence…", "evidence: … assigned reviewer" |
| Duplicate request retry → no duplicate match/meeting | ✅ | open-pair unique index, meeting idempotency key | "duplicate interest retry…", "…meetings are idempotent" |
| Unsafe report → case, urgent moderation | ✅ | `file_report`, `admin_*suspension` | "unsafe report…", "moderator suspension…" |
| Telugu locale → labels, validation, templates localised | 🟢 | `packages/shared/src/i18n` (type-enforced parity); notification copy rendered client-side from template keys | `tsc` fails on missing/unknown keys |

## Invariants (PRD §7)

| | Status | Enforcement |
|---|---|---|
| I1 discovery eligibility | ✅ | `app_private.is_discoverable` used by discovery, profile, interests, broker search, storage photo policy |
| I2 independent candidate decisions | ✅ | `decide_match` requires `owner_user_id = auth.uid()` for that side |
| I3 contact = mutual + scoped grant + recipient | ✅ | `grant_contact` / `get_introduction_contacts` |
| I4 no resurrection of revoked consent | ✅ | Every check reads live rows; delegations also require *current* family membership; no API caching in SW |
| I5 atomic & audited mutations | ✅ | Single-transaction RPCs; append-only `audit_events` (trigger-protected); audited denials returned, not raised |

## Screens

| ID | Status | File |
|---|---|---|
| M01 Splash & Welcome | 🟢 | `apps/pwa/src/pages/Welcome.tsx` |
| M02 Language | 🟢 | `pages/Language.tsx`, Settings |
| M03 OTP login | 🟢 | `packages/shared/src/ui/PhoneOtpForm.tsx` (resend timer; server caps via Supabase Auth) |
| M04 Membership apply | ✅ | `pages/Apply.tsx` |
| M05 Supporting evidence | ✅ | `pages/Status.tsx` → private `evidence` bucket |
| M06 Application status | ✅ | `pages/Status.tsx` |
| M07 Family home | 🟢 | `pages/Home.tsx` |
| M08 Add candidate draft | ✅ | `pages/CandidateNew.tsx`, `components/BiodataForm.tsx` |
| M09 Candidate invitation | ✅ | `pages/CandidateEdit.tsx` (InviteCandidate), `pages/Join.tsx` |
| M10 Review & consent | ✅ | `pages/Consent.tsx` (3 steps, step-up OTP) |
| M11 Privacy settings | ✅ | `pages/Privacy.tsx` |
| M12 Discover | ✅ | `pages/Discover.tsx` |
| M13 Profile details | ✅ | `pages/Profile.tsx` |
| M14 Shortlist | ✅ | `pages/Shortlist.tsx`, Profile |
| M15 Send interest | ✅ | `pages/Profile.tsx` (InterestSheet) |
| M16 Interests inbox | ✅ | `pages/Interests.tsx` |
| M17 Introductions timeline | ✅ | `pages/Introductions.tsx`, `pages/Introduction.tsx` |
| M18 Contact sharing | ✅ | `pages/Introduction.tsx` (ShareSheet, ContactsSection) |
| M19 Meeting proposal | ✅ | `pages/Introduction.tsx` (MeetingSheet) |
| M20 Notifications | 🟡 | `pages/Notifications.tsx` — in-app only; mute/quiet-hours stored, **web push not yet sent** |
| M21 Family & profile settings | 🟢 | `pages/Family.tsx`, `pages/Settings.tsx` (export/delete *requests*, processed by staff) |
| M22 Help / report | ✅ | `pages/Help.tsx` |
| A01–A10 | 🟢 | `apps/admin/src/pages/*` (backed by tested RPCs) |

## Delivery plan (PRD §16)

| Milestone | Status |
|---|---|
| P0 Foundation (repo, auth, roles, i18n, migrations, RLS, audit) | ✅ — CI pipeline ⛔ (add GitHub Actions running `npm run test:db` + `typecheck`) |
| P1 Membership & consent | ✅ |
| P2 Discovery & matching | ✅ |
| P3 Introductions & privacy | ✅ except web push |
| P4 Admin & safety | ✅ (analytics limited to overview counts) |
| P5 Closed pilot | ⛔ — security review, accessibility QA, Telugu copy validation, legal review outstanding |

## Design Asset & Visual Language Guide (v1.0)

| Item | Status | Where |
|---|---|---|
| §3 colour tokens, §4 type/radius/motion (150–250 ms, reduced motion), light theme locked | ✅ | `packages/shared/src/styles/tokens.css` (single token source for PWA + admin) |
| §5 P0 assets: logo (EN + Telugu lockup), mark, mono, app icon 1024, 2 patterns, divider, horizon, 7 illustrations, 5 icons | 🟡 | `packages/shared/src/assets/` — original in-house concepts; **need designer production + Telugu proofreading** |
| §5/§12 `assets-manifest.json` with ownership/licensing | ✅ | `packages/shared/src/assets/assets-manifest.json` |
| §6 screen mapping (splash horizon, consent/invite/verification/privacy/introduction illustrations, field motif on registration, admin neutral with maroon rails) | 🟢 | PWA pages + `apps/admin/src/admin.css` |
| §7 distinct badges backed by real state (phone, family, consent, profile reviewed) | ✅ | `get_profile.checks` (tested) → `TrustBadges` |
| §7 photos never sent then blurred client-side | ✅ | Photo path only returned when permitted; storage policy re-checks |
| §11 alt text for meaningful illustrations; decorative marked `aria-hidden` | ✅ | `Illustration` component, `illustration.*` strings |
| §12 visual QA on low-end Android / iPhone / admin breakpoints | ⛔ | Only pre-login screens checked in desktop Chrome so far |
