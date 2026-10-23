import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mark, storedLocale } from '@induru/shared';
import { useSession } from '../app/session';
import { SplashArcs } from '../components/Ornament';

/** M01 — gold mark on deep maroon; field-row horizon in the footer only. No candidate data before login. */
export default function Welcome() {
  const { t } = useTranslation();
  const { authSession } = useSession();
  if (authSession) return <Navigate to="/" replace />;
  if (!storedLocale()) return <Navigate to="/language" replace />;
  return (
    <div className="splash">
      <div className="splash-top">
        <Mark size={96} width={1.3} />
        <div>
          <div className="splash-name" lang="en">Induru<br />Mangalyam</div>
          <div className="splash-name-te" lang="te">ఇందూరు మాంగల్యం</div>
        </div>
        <div className="gold-rule" />
        <p className="splash-tag">{t('welcome.tagline')}</p>
        <p className="splash-tag-te" lang="te">కుటుంబ సహకారంతో, గోప్యంగా, నమ్మకంగా.</p>
      </div>
      <div className="splash-foot">
        <SplashArcs />
        <div className="actions">
          <Link to="/login" className="btn btn-ivory btn-block">{t('welcome.login')}</Link>
          <Link to="/login?apply=1" className="btn btn-outline-gold btn-block">{t('welcome.apply')}</Link>
          <div className="fine">{t('welcome.byInvitation')} · <Link to="/language" style={{ color: 'inherit' }}>{t('language.te')} / {t('language.en')}</Link></div>
        </div>
      </div>
    </div>
  );
}
