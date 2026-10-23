import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardSkeleton, Checkbox, EmptyState, ErrorNotice, Field, Icon, Input, Notice, Sheet, fmtRelative, type Locale } from '@induru/shared';
import { api, qk } from '../lib/api';
import { useMe, useSession } from '../app/session';
import { PageHeader } from '../components/Page';
import { notificationKey, notificationLink } from '../lib/notifications';

const CATEGORIES = ['interest', 'introduction', 'meeting', 'broker', 'membership'] as const;

/** M20 — generic wording only; mute and quiet hours (safety alerts always on). */
export default function Notifications() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { refresh } = useSession();
  const q = useQuery({ queryKey: qk.notifications, queryFn: api.notifications });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!q.data?.some((n) => n.status === 'UNREAD')) return;
    const id = setTimeout(() => {
      void api.markRead().then(() => Promise.all([qc.invalidateQueries({ queryKey: qk.notifications }), refresh()]));
    }, 1500);
    return () => clearTimeout(id);
  }, [q.data, qc, refresh]);

  return (
    <div className="page stack">
      <PageHeader title={t('notifications.title')} back action={
        <Button variant="ghost" small onClick={() => setSettingsOpen(true)}><Icon name="settings" size={16} />{t('notifications.settings')}</Button>
      } />
      {q.isLoading ? <CardSkeleton /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length ? (
        <div className="card list">
          {q.data.map((n) => (
            <Link key={n.id} to={notificationLink(n)} className="list-item">
              <Icon name="bell" size={18} style={{ color: n.status === 'UNREAD' ? 'var(--maroon)' : 'var(--slate)' }} />
              <span className="grow small" style={{ fontWeight: n.status === 'UNREAD' ? 650 : 400 }}>
                {t(notificationKey(n.template_key) as 'notif.fallback', { defaultValue: t('notif.fallback') })}
              </span>
              <span className="xsmall muted">{fmtRelative(n.created_at, i18n.language as Locale)}</span>
            </Link>
          ))}
        </div>
      ) : <EmptyState icon="bell" title={t('notifications.empty')} />}
      <NotificationSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function NotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const me = useMe();
  const { refresh } = useSession();
  const prefs = me.user.notification_prefs;
  const [muted, setMuted] = useState<string[]>(prefs.muted ?? []);
  const [quiet, setQuiet] = useState(prefs.quiet_hours ?? { start: '22:00', end: '07:00' });
  const [quietOn, setQuietOn] = useState(!!prefs.quiet_hours);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.setPreferences({ notificationPrefs: { muted, quiet_hours: quietOn ? quiet : null } });
      await refresh();
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('notifications.settings')}>
      <p className="label">{t('notifications.mute')}</p>
      {CATEGORIES.map((c) => (
        <Checkbox key={c} label={t(`notifications.categories.${c}`)} checked={muted.includes(c)}
          onChange={(e) => setMuted(e.target.checked ? [...muted, c] : muted.filter((x) => x !== c))} />
      ))}
      <Notice tone="neutral" icon="shield"><span className="small">{t('notifications.safetyAlwaysOn')}</span></Notice>
      <Checkbox label={t('notifications.quietHours')} checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} />
      {quietOn ? (
        <div className="grid-2">
          <Field label={t('notifications.quietFrom')}>{(p) => <Input {...p} type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />}</Field>
          <Field label={t('notifications.quietTo')}>{(p) => <Input {...p} type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />}</Field>
        </div>
      ) : null}
      <ErrorNotice error={err} />
      <Button block onClick={() => void save()} loading={busy}>{t('common.save')}</Button>
    </Sheet>
  );
}
