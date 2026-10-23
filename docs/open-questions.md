# Open questions — must be resolved before the pilot

These are policy/legal decisions the PRD (§14, §17) leaves open. The code does **not** silently decide
them; where a default was needed it is configurable or clearly marked.

| # | Question | Current behaviour | Owner |
|---|---|---|---|
| 1 | Membership eligibility criteria and appeals process | Free-text declaration + reference + verifier checklist. No surname/caste inference anywhere. | Community committee + counsel |
| 2 | Legal minimum marriage age | `min_age_male = 21`, `min_age_female = 18` in `app.config` (Prohibition of Child Marriage Act, 2006). Confirm with counsel. | Counsel |
| 3 | Exact verification evidence and retention period | Optional docs; types exclude Aadhaar; `evidence_retention_days = 90`; manual purge in A10. | Counsel + verifiers |
| 4 | DPDP Act 2023 / Rules compliance (notice, consent manager, grievance officer, breach process) | Draft `apps/pwa/public/privacy.html`; data export/deletion are *requests* handled by staff. | Counsel |
| 5 | Intermediary status, consumer-protection claims, caste-related eligibility risk, trademark | Not addressed in code. | Counsel |
| 6 | SMS provider + DLT template registration for OTP in India | Not configured. | Ops |
| 7 | Messaging after consent | None (broker + shared contacts). | Product |
| 8 | Charging families / refunds | Out of scope (no payments). | Product |
| 9 | Community admin structure & district scopes | Roles support `DISTRICT` scope in schema; checks are global for MVP. | Product |
| 10 | Telugu copy review | Machine-quality draft in `te.ts` — needs native review. | Community volunteers |
| 12 | Brand artwork: in-house concept SVGs (logo, illustrations, patterns) need professional design and Telugu lockup proofreading; heritage motifs to be validated with regional stakeholders | `packages/shared/src/assets` + manifest | Design |
| 11 | Web push (quiet hours, generic payloads) | Preferences stored; delivery not implemented. | Engineering (next) |
