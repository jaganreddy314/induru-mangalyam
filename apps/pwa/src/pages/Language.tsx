import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Icon, setLocale, type Locale } from '@induru/shared';
import { useSession } from '../app/session';
import { api } from '../lib/api';
import { CornerArcs } from '../components/Ornament';

/** M02 — each option names itself in its own script; selection shows a filled check as well as the border. */
export default function LanguagePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { authSession, refresh } = useSession();
  const [choice, setChoice] = useState<Locale>(i18n.language === 'en' ? 'en' : 'te');
  const [busy, setBusy] = useState(false);
  const pick = (l: Locale) => { setChoice(l); setLocale(l); };
  const go = async () => {
    setBusy(true);
    setLocale(choice);
    if (authSession) {
      await api.setPreferences({ locale: choice }).catch(() => undefined);
      void refresh();
    }
    navigate(authSession ? '/settings' : '/welcome', { replace: true });
  };
  return (
    <div className="screen" style={{ position: 'relative', overflow: 'hidden' }}>
      <CornerArcs />
      <div className="screen-body" style={{ paddingTop: 'max(72px, 12vh)', gap: 28 }}>
        <div>
          <h1 lang="en" style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1.1, marginBottom: 6 }}>Choose your language</h1>
          <div lang="te" className="te" style={{ fontWeight: 500, fontSize: 18, color: 'var(--slate)' }}>మీ భాషను ఎంచుకోండి</div>
        </div>
        <div className="stack-sm" role="radiogroup" aria-label={t('language.title')} style={{ gap: 12 }}>
          <button type="button" role="radio" aria-checked={choice === 'te'} className="lang-card" onClick={() => pick('te')}>
            <span className="grow"><span lang="te" className="te" style={{ display: 'block', fontWeight: 500, fontSize: 24 }}>తెలుగు</span><span className="small muted">Telugu</span></span>
            <span className="mark">{choice === 'te' ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}</span>
          </button>
          <button type="button" role="radio" aria-checked={choice === 'en'} className="lang-card" onClick={() => pick('en')}>
            <span className="grow"><span lang="en" style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24 }}>English</span><span lang="te" className="small muted te">ఇంగ్లీష్</span></span>
            <span className="mark">{choice === 'en' ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}</span>
          </button>
        </div>
        <p className="small muted">{t('language.subtitle')}</p>
      </div>
      <div className="screen-foot">
        <Button block loading={busy} onClick={() => void go()}>{t('common.continue')}</Button>
      </div>
    </div>
  );
}
