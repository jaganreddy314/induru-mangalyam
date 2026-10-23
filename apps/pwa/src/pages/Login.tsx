import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, PhoneOtpForm, TesterAccounts, type TesterAccount } from '@induru/shared';
import { useSession } from '../app/session';

// Tester panel: local dev, or a demo build with VITE_TESTER_MODE=true (Supabase test OTP numbers).
const TESTER_MODE = import.meta.env.DEV || import.meta.env.VITE_TESTER_MODE === 'true';

const TESTERS: TesterAccount[] = [
  { phone: '+919000000011', label: 'Kotha father (family)' },
  { phone: '+919000000012', label: 'Arjun — candidate, Kotha' },
  { phone: '+919000000021', label: 'Pasula mother (family)' },
  { phone: '+919000000022', label: 'Lakshmi — candidate, Pasula' },
  { phone: '+919000000031', label: 'Gaddam father (family)' },
  { phone: '+919000000032', label: 'Sravani — candidate, Gaddam' },
  { phone: '+919000000041', label: 'Bheemana — pending application' },
  { phone: '+919000000051', label: 'New member — apply from scratch' },
  { phone: '+919000000052', label: 'Second new member — apply from scratch' },
];

/** M03 — masked number, visible resend timer, retry cap explained; session only after verified OTP. */
export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { authSession } = useSession();
  const [prefill, setPrefill] = useState<string | undefined>();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (authSession) return <Navigate to={from} replace />;
  return (
    <div className="screen">
      <div className="topbar">
        <button type="button" className="icon-btn" onClick={() => navigate('/welcome')} aria-label={t('common.back')}><Icon name="arrowLeft" /></button>
      </div>
      <div className="screen-body" style={{ paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        <PhoneOtpForm key={prefill} screen defaultPhone={prefill} testerCode={TESTER_MODE ? '123456' : undefined}
          submitLabel={t('auth.verifyContinue')} onVerified={() => navigate(from, { replace: true })} />
        {TESTER_MODE ? <TesterAccounts accounts={TESTERS} onPick={setPrefill} /> : null}
      </div>
    </div>
  );
}
