import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError, PhoneOtpForm, Sheet } from '@induru/shared';
import { useSession } from './session';

type Runner = <T>(fn: () => Promise<T>) => Promise<T>;
const Ctx = createContext<Runner | null>(null);

/**
 * Consent and contact-sharing require a recent OTP (server returns REAUTH_REQUIRED).
 * `withStepUp(fn)` runs fn; on REAUTH_REQUIRED it asks the user to verify their phone
 * again, then retries once.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  const withStepUp: Runner = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (!isApiError(e, 'REAUTH_REQUIRED')) throw e;
      await new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setOpen(true);
      });
      return fn();
    }
  }, []);

  const close = () => {
    setOpen(false);
    pending.current?.reject(new Error('cancelled'));
    pending.current = null;
  };

  return (
    <Ctx.Provider value={withStepUp}>
      {children}
      <Sheet open={open} onClose={close} title={t('auth.reauthTitle')}>
        <p className="muted">{t('auth.reauthBody')}</p>
        {state?.user.phone ? (
          <PhoneOtpForm lockedPhone={state.user.phone} onVerified={() => {
            setOpen(false);
            void refresh();
            pending.current?.resolve();
            pending.current = null;
          }} />
        ) : null}
      </Sheet>
    </Ctx.Provider>
  );
}

export function useStepUp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStepUp outside StepUpProvider');
  return ctx;
}
