import { useTranslation } from 'react-i18next';
import { brand, illustrations, type IllustrationName } from '../assets';
import { Icon, type IconName } from './Icon';

/** Workflow illustration with real alt text (guide §11). */
export function Illustration({ name, small }: { name: IllustrationName; small?: boolean }) {
  const { t } = useTranslation();
  return <img src={illustrations[name]} alt={t(`illustration.${name}`)} className={`illustration${small ? ' illustration-sm' : ''}`} loading="lazy" />;
}

export function FloralDivider() {
  return <img src={brand.floralDivider} alt="" aria-hidden="true" className="divider-floral" />;
}

export type TrustCheck = 'phone_verified' | 'family_verified' | 'consent_confirmed' | 'profile_reviewed';
const CHECK_ICON: Record<TrustCheck, IconName> = {
  phone_verified: 'phone',
  family_verified: 'shieldCheck',
  consent_confirmed: 'userCheck',
  profile_reviewed: 'fileCheck',
};

/** One badge per completed check — shown only when the backend reports it true. */
export function TrustBadges({ checks, only }: { checks: Partial<Record<TrustCheck, boolean>>; only?: TrustCheck[] }) {
  const { t } = useTranslation();
  const keys = (only ?? (Object.keys(CHECK_ICON) as TrustCheck[])).filter((k) => checks[k]);
  if (!keys.length) return null;
  return (
    <div className="badges">
      {keys.map((k) => (
        <span key={k} className="badge badge-teal"><Icon name={CHECK_ICON[k]} size={12} />{t(`badges.${k}`)}</span>
      ))}
    </div>
  );
}
