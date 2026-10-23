import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Button, CardSkeleton, ErrorNotice, Field, Input, Notice, PhoneOtpForm, TesterAccounts, getSupabase, rpc, type SessionState, type TesterAccount } from '@induru/shared';

// Tester panel: local dev, or a demo build with VITE_TESTER_MODE=true (Supabase test OTP numbers).
const TESTER_MODE = import.meta.env.DEV || import.meta.env.VITE_TESTER_MODE === 'true';

const TESTERS: TesterAccount[] = [
  { phone: '+919000000001', label: 'Super admin' },
  { phone: '+919000000002', label: 'Verifier' },
  { phone: '+919000000003', label: 'Broker' },
  { phone: '+919000000004', label: 'Moderator' },
];

type Aal = { current: string | null; next: string | null };

/**
 * Staff gate: phone OTP → TOTP second factor (enrol on first use) → staff role check.
 * The database independently refuses staff RPCs without aal2 (MFA_REQUIRED).
 */
export function StaffGate({ children }: { children: (state: SessionState) => ReactNode }) {
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [aal, setAal] = useState<Aal | null>(null);
  const [prefill, setPrefill] = useState<string | undefined>();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) qc.clear(); });
    return () => data.subscription.unsubscribe();
  }, [supabase, qc]);

  useEffect(() => {
    if (!session) { setAal(null); return; }
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) =>
      setAal({ current: data?.currentLevel ?? null, next: data?.nextLevel ?? null }));
  }, [session, supabase]);

  const state = useQuery({
    queryKey: ['staff-session', session?.user.id, aal?.current],
    enabled: !!session && aal?.current === 'aal2',
    queryFn: () => rpc<SessionState>('ensure_profile', { p_locale: 'en' }),
  });

  if (session === undefined) return <Centered><CardSkeleton count={1} /></Centered>;
  if (!session) {
    return (
      <Centered>
        <Brand />
        <h1>Staff sign in</h1>
        <div className="card"><PhoneOtpForm key={prefill} defaultPhone={prefill} testerCode={TESTER_MODE ? '123456' : undefined} onVerified={() => undefined} /></div>
        {TESTER_MODE ? <TesterAccounts accounts={TESTERS} onPick={setPrefill} /> : null}
      </Centered>
    );
  }
  if (!aal) return <Centered><CardSkeleton count={1} /></Centered>;
  if (aal.current !== 'aal2') {
    return <Centered><Brand /><MfaStep onDone={(next) => setAal(next)} /></Centered>;
  }
  if (state.isLoading) return <Centered><CardSkeleton count={1} /></Centered>;
  if (state.error) return <Centered><ErrorNotice error={state.error} onRetry={() => void state.refetch()} /></Centered>;
  if (!state.data?.staff_roles.length) {
    return (
      <Centered>
        <Notice tone="error">This account has no staff role. Access is restricted to authorised staff.</Notice>
        <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</Button>
      </Centered>
    );
  }
  return <>{children(state.data)}</>;
}

function MfaStep({ onDone }: { onDone: (a: Aal) => void }) {
  const supabase = getSupabase();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrol, setEnrol] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp.find((f) => f.status === 'verified');
      if (verified) { setFactorId(verified.id); return; }
      // Remove abandoned unverified enrolments before starting a new one.
      for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `staff-${Date.now()}` });
      if (error || !e) { setErr(error?.message ?? 'Could not start enrolment'); return; }
      setFactorId(e.id);
      setEnrol({ qr: e.totp.qr_code, secret: e.totp.secret });
    })();
  }, [supabase]);

  const verify = async () => {
    if (!factorId) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setErr('Incorrect code. Try again.');
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    onDone({ current: data?.currentLevel ?? null, next: data?.nextLevel ?? null });
  };

  return (
    <div className="card stack">
      <h1>Two-factor verification</h1>
      {enrol ? (
        <div className="stack-sm">
          <p className="muted small">Staff accounts require an authenticator app. Scan this code, then enter the 6-digit code it shows.</p>
          <img src={enrol.qr} alt="Authenticator QR code" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
          <p className="xsmall muted">Or enter key: <code className="mono">{enrol.secret}</code></p>
        </div>
      ) : <p className="muted small">Enter the code from your authenticator app.{import.meta.env.DEV ? ' Tester backend: 123456.' : ''}</p>}
      <Field label="6-digit code" error={err ?? undefined}>
        {(p) => <Input {...p} className="input-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />}
      </Field>
      <Button block onClick={() => void verify()} loading={busy} disabled={code.length !== 6 || !factorId}>Verify</Button>
      <Button variant="ghost" small onClick={() => void supabase.auth.signOut()}>Sign out</Button>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="page stack-lg" style={{ maxWidth: 420, paddingTop: '10vh' }}>{children}</div>;
}

function Brand() {
  return (
    <div className="row">
      <img src="/favicon.svg" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
      <span className="brand-display" style={{ fontSize: '1.375rem', color: 'var(--maroon)' }}>Induru Mangalyam · Staff</span>
    </div>
  );
}
