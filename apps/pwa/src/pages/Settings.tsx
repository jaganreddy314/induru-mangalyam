import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, ErrorNotice, Field, Icon, Input, Notice, Sheet, setLocale, type Locale } from '@induru/shared';
import { api } from '../lib/api';
import { useMe, useSession } from '../app/session';
import { PageHeader } from '../components/Page';

/** M21 — language, name, data rights, leave family, sign out. */
export default function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const { refresh, signOut } = useSession();
  const [name, setName] = useState(me.user.display_name ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setErr(null); setMsg(null);
    try { await fn(); await refresh(); if (success) setMsg(success); } catch (e) { setErr(e); }
  };
  const changeLang = (l: Locale) => run(async () => { setLocale(l); await api.setPreferences({ locale: l }); });

  return (
    <div className="page stack-lg">
      <PageHeader title={t('settings.title')} back />
      <section className="stack">
        <p className="kicker">{t('settings.language')}</p>
        <div className="segmented" role="group">
          {(['te', 'en'] as const).map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={i18n.language === l} onClick={() => void changeLang(l)}>{t(`language.${l}`)}</button>
          ))}
        </div>
        <Field label={t('settings.displayName')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Button variant="secondary" small onClick={() => void run(() => api.setPreferences({ displayName: name }), t('common.saved'))}>{t('common.save')}</Button>
      </section>

      <section>
        <p className="kicker" style={{ marginBottom: 6 }}>{t('settings.data')}</p>
        <div className="menu-list">
          <button type="button" onClick={() => void run(() => api.requestData('EXPORT'), t('settings.requestSent'))}><Icon name="file" size={20} /><span className="grow">{t('settings.exportData')}</span></button>
          <button type="button" onClick={() => void run(() => api.requestData('ACCOUNT'), t('settings.requestSent'))}><Icon name="x" size={20} /><span className="grow">{t('settings.deleteAccount')}</span></button>
          <button type="button" className="danger" onClick={() => setLeaveOpen(true)}><Icon name="logout" size={20} /><span className="grow">{t('settings.leaveFamily')}</span></button>
        </div>
      </section>
      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('settings.leaveFamily')}>
        <p className="muted">{t('settings.leaveConfirm')}</p>
        <Button block variant="danger" onClick={() => void run(async () => { await api.leaveFamily(); setLeaveOpen(false); navigate('/', { replace: true }); })}>{t('settings.leaveFamily')}</Button>
      </Sheet>
      {msg ? <Notice tone="success">{msg}</Notice> : null}
      <ErrorNotice error={err} />

      <nav className="menu-list">
        <Link to="/help"><Icon name="lifeBuoy" size={20} /><span className="grow">{t('family.help')}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></Link>
        <a href={`${import.meta.env.BASE_URL}privacy.html`}><Icon name="lock" size={20} /><span className="grow">{t('settings.privacyPolicy')}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></a>
      </nav>
      <Button variant="ghost" onClick={() => void signOut()}><Icon name="logout" size={18} />{t('common.signOut')}</Button>
      <p className="center xsmall muted">{t('settings.version', { version: '0.1.0' })}</p>
    </div>
  );
}
