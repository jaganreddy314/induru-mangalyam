// Brand assets (see assets/assets-manifest.json for provenance). Imported as URLs so they are
// fingerprinted and precached by the PWA; never used for private/member images.
import markOnly from './assets/brand/mark-only.svg';
import markOnMaroon from './assets/brand/mark-on-maroon.svg';
import logoPrimary from './assets/brand/logo-primary.svg';
import floralDivider from './assets/decor/floral-divider.svg';
import indhurHorizon from './assets/heritage/indhur-horizon.svg';
import candidateConsent from './assets/illustrations/candidate-consent.svg';
import familyInvitation from './assets/illustrations/family-invitation.svg';
import familyVerification from './assets/illustrations/family-verification.svg';
import mutualIntroduction from './assets/illustrations/mutual-introduction.svg';
import privacyLock from './assets/illustrations/privacy-lock.svg';
import emptyMatches from './assets/illustrations/empty-matches.svg';
import meetingScheduled from './assets/illustrations/meeting-scheduled.svg';

export const brand = { markOnly, markOnMaroon, logoPrimary, floralDivider, indhurHorizon };

export const illustrations = {
  candidateConsent, familyInvitation, familyVerification, mutualIntroduction, privacyLock, emptyMatches, meetingScheduled,
};
export type IllustrationName = keyof typeof illustrations;
