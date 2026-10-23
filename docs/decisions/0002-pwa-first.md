# 0002 — PWA first instead of React Native

**Status:** accepted · 2026-10-23 (product owner request)

The PRD recommends React Native + Expo. For the MVP we ship an installable PWA (React + Vite +
`vite-plugin-pwa`) because it needs no app-store review, installs from a WhatsApp-shared link,
and shares a TypeScript UI kit with the admin app.

Trade-offs and mitigations:
- **Push on iOS** requires the PWA to be installed to the home screen (iOS 16.4+). In-app
  notifications work everywhere; web push is a follow-up.
- **SMS OTP autofill** works via `autocomplete="one-time-code"`.
- **Privacy:** the service worker caches only the app shell and fonts — never API responses.
- The RPC contract, i18n and DTOs in `packages/shared` are framework-neutral so a React Native app
  can be added later without backend changes.
