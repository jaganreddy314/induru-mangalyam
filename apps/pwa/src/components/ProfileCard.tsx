import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon, TrustBadges, type PublicCard } from '@induru/shared';

export function cardMeta(c: PublicCard, t: TFunction) {
  return [c.age ? t('common.years', { count: c.age }) : null, c.profession, c.city ?? c.district].filter(Boolean).join(' · ');
}

/** "26 · Hyderabad" — the editorial title used on cards and inbox rows. */
export function cardTitle(c: PublicCard) {
  return [c.age, c.city ?? c.district].filter(Boolean).join(' · ');
}

/** Photo slot: a lock panel when a photo exists but is restricted, otherwise a monogram.
 *  Restricted images never reach the client. */
export function PhotoSlot({ card, src }: { card: PublicCard; src?: string | null }) {
  const { t } = useTranslation();
  if (src) return <div className="photo-slot"><img src={src} alt="" /></div>;
  if (card.has_photo) return <div className="photo-slot"><Icon name="lock" size={18} /><small>{t('discover.photoAfterAccept')}</small></div>;
  return <div className="photo-slot mono" aria-hidden="true">{(card.city ?? card.district ?? card.code.replace(/^IM-/, '')).slice(0, 1).toUpperCase()}</div>;
}

/** M12 card — profile code instead of name; code, age, city, profession; never names or contact details. */
export function ProfileCard({ card, to, action }: { card: PublicCard; to?: string; action?: ReactNode }) {
  const { t } = useTranslation();
  const body = (
    <>
      <PhotoSlot card={card} />
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <span className="code">{card.code}</span>
          {action}
        </div>
        {card.unavailable ? <span className="profile-meta">{t('common.unavailable')}</span> : (
          <>
            <div className="pcard-title">{cardTitle(card)}</div>
            <div className="small body2">{[card.profession, card.education].filter(Boolean).join(' · ') || t('common.notProvided')}</div>
            {card.district && card.city && card.district !== card.city ? <div className="xsmall muted">{t('discover.district', { district: card.district })}</div> : null}
            <div style={{ marginTop: 4 }}><TrustBadges checks={{ profile_reviewed: !!card.verified }} only={['profile_reviewed']} /></div>
          </>
        )}
      </div>
    </>
  );
  return to && !card.unavailable ? <Link to={to} className="pcard">{body}</Link> : <div className="pcard">{body}</div>;
}
