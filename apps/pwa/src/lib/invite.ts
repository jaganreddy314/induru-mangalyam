// Invitation links (/join?t=…) are opened before sign-in; remember the token for after OTP.
const KEY = 'im.invite';

export function rememberInviteToken(token: string) {
  try { sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
}
export function pendingInviteToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function clearInviteToken() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function inviteLink(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}join?t=${encodeURIComponent(token)}`;
}
