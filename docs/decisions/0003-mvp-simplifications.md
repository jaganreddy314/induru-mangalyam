# 0003 — MVP simplifications

**Status:** accepted · 2026-10-23

1. **One active family per user.** A person belongs to at most one family account at a time
   (`family_members_one_active_family`). Staff roles are separate, scoped assignments.
2. **Candidate ↔ family link** is a single active `family_candidates` row.
3. **DOB stored precisely but private**; only age is projected (PRD §17 default).
4. **No in-app messaging.** Coordination via broker and shared contact details only (PRD §17 default).
5. **Matching is rules-based and explainable** (`admin_matchmaking_search` returns reasons), no scoring
   model. Broker search assumes opposite-gender pairing when "suggest for" a candidate is used.
6. **Decline cooldown**: a declined pair cannot be re-requested for `decline_cooldown_days` (180).
7. **Interests expire** after `interest_ttl_days` (21) — expiry is applied lazily on read and can be
   scheduled with pg_cron.
8. **Step-up auth** for consent, contact sharing and withdrawal: OTP must be within
   `fresh_auth_minutes` (60).
9. **Broker notes** are encrypted with `pgp_sym_encrypt`; key in `app_private.secrets` (move to Vault).
10. **Admin UI is English-only**; member PWA is Telugu/English.
11. **Light theme only** for the MVP (Design guide §9); `color-scheme: light` is set explicitly.
