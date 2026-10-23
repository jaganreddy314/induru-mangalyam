import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabase, toE164 } from '../supabase';
import { maskPhone } from '../format';
import { Button, Field, Input, Notice } from './primitives';
import { Icon } from './Icon';

interface Props {
  /** Pre-filled and locked phone (step-up re-verification). */
  lockedPhone?: string;
  onVerified: () => void;
  submitLabel?: string;
  /** Full-screen layout (M03): kicker + display heading, CTA pinned to the bottom. */
  screen?: boolean;
  /** Pre-fills the number (tester accounts in local development). */
  defaultPhone?: string;
  /** Local development only: shown on the code step so testers know what to enter. */
  testerCode?: string;
}

const RESEND_SECONDS = 30;

/** M03 — phone + OTP sign-in. Server-side retry caps come from Supabase Auth rate limits. */
export function PhoneOtpForm({ lockedPhone, onVerified, submitLabel, screen, defaultPhone, testerCode }: Props) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState(lockedPhone ?? defaultPhone ?? '');
  const [e164, setE164] = useState<string | null>(lockedPhone ?? null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const normalised = toE164(phone);
    if (!normalised) return setError(t('auth.invalidPhone'));
    setBusy(true);
    const { error: err } = await getSupabase().auth.signInWithOtp({ phone: normalised, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) return setError(err.status === 429 ? t('auth.tooMany') : t('errors.NETWORK'));
    setE164(normalised);
    setStep('otp');
    setWait(RESEND_SECONDS);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!e164) return;
    setError(null);
    setBusy(true);
    const { error: err } = await getSupabase().auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (err) return setError(err.status === 429 ? t('auth.tooMany') : t('auth.invalidOtp'));
    onVerified();
  }

  const head = (title: string, body?: ReactNode) => screen ? (
    <div>
      <div className="kicker" style={{ marginBottom: 8 }}>{t('welcome.login')}</div>
      <h1 style={{ fontSize: 32, marginBottom: 10 }}>{title}</h1>
      {body ? <p className="muted" style={{ fontSize: 15 }}>{body}</p> : null}
    </div>
  ) : body ? <p className="muted">{body}</p> : null;
  const safety = (
    <div className="rule-top row" style={{ alignItems: 'flex-start', fontSize: 13, color: 'var(--slate)', paddingTop: 18 }}>
      <Icon name="shield" size={18} style={{ color: 'var(--teal)', flex: 'none' }} /><span>{t('auth.safety')}</span>
    </div>
  );
  const cls = screen ? 'otp-screen' : 'stack';

  if (step === 'phone') {
    return (
      <form className={cls} onSubmit={send} noValidate>
        <div className="stack" style={{ gap: 28 }}>
          {head(t('auth.phoneTitle'), t('auth.phoneHint'))}
          <Field label={t('auth.phoneLabel')} error={error ?? undefined}>
            {(p) => (
              <div className="input-prefix">
                <span>+91</span>
                <Input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="98xxx xxxxx"
                  value={phone.replace(/^\+?91(?=\d{10})/, '')} onChange={(e) => setPhone(e.target.value)} readOnly={!!lockedPhone} autoFocus={!lockedPhone} />
              </div>
            )}
          </Field>
        </div>
        <Button type="submit" block loading={busy}>{t('auth.sendCode')}</Button>
      </form>
    );
  }

  const cur = Math.min(code.length, 5);
  return (
    <form className={cls} onSubmit={verify} noValidate>
      <div className="stack" style={{ gap: 28 }}>
        {head(t('auth.otpTitle'), (
          <>
            {t('auth.otpSentTo', { phone: maskPhone(e164 ?? '') })}
            {lockedPhone ? null : <> · <button type="button" className="link" style={{ fontWeight: 400, textDecoration: 'underline', fontSize: 'inherit' }}
              onClick={() => { setStep('phone'); setCode(''); setError(null); }}>{t('auth.changeNumber')}</button></>}
          </>
        ))}
        <div className="field">
          <label className="visually-hidden" htmlFor="otp-code">{t('auth.otpLabel')}</label>
          <div className="otp-boxes">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={i === cur && code.length < 6 ? 'cur' : ''} aria-hidden="true">{code[i] ?? ''}</span>
            ))}
            <input id="otp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" autoFocus
              aria-invalid={error ? true : undefined} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          {error ? <p className="field-error" role="alert"><Icon name="circleAlert" size={15} />{error}</p> : null}
        </div>
        <div className="row-between small muted">
          {wait > 0
            ? <><span>{t('auth.resendIn', { seconds: wait })}</span><span style={{ color: 'var(--control)' }}>{t('auth.resend')}</span></>
            : <><span /><button type="button" className="link" disabled={busy} onClick={() => send()}>{t('auth.resend')}</button></>}
        </div>
        {testerCode ? <Notice tone="info" icon="key">Tester code: <strong className="num">{testerCode}</strong> (local development only)</Notice> : null}
        {safety}
        {error === t('auth.tooMany') ? <Notice tone="error">{t('auth.tooMany')}</Notice> : null}
      </div>
      <Button type="submit" block loading={busy} disabled={code.length !== 6}>{submitLabel ?? t('auth.verify')}</Button>
    </form>
  );
}
