import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, CardSkeleton, Checkbox, ErrorNotice, Icon, Notice, OptionRow, Sheet, type PhotoVisibility, type Visibility } from '@induru/shared';
import { api, qk } from '../lib/api';
import { useStepUp } from '../app/stepUp';
import { useSession } from '../app/session';
import { PageHeader, TopBar } from '../components/Page';

/** M11 — candidate-only. Green only for a protection that is really on. Revocations take effect at once;
 *  withdrawal sits last, in error wine, behind a confirmation. */
export default function Privacy() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const withStepUp = useStepUp();
  const { refresh } = useSession();
  const q = useQuery({ queryKey: qk.candidate(id), queryFn: () => api.candidate(id) });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteToo, setDeleteToo] = useState(false);

  if (q.isLoading) return <div className="page"><CardSkeleton count={3} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} /></div>;
  const c = q.data!;
  if (!c.is_owner) return <Navigate to={`/candidates/${id}`} replace />;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try {
      await fn();
      await Promise.all([qc.invalidateQueries({ queryKey: qk.candidate(id) }), qc.invalidateQueries({ queryKey: qk.familyCandidates }), refresh()]);
    } catch (e) { if (!(e instanceof Error && e.message === 'cancelled')) setErr(e); } finally { setBusy(null); }
  };

  if (c.status === 'WITHDRAWN') {
    return <div className="page stack"><PageHeader title={t('privacy.title')} back /><Notice tone="neutral">{t('privacy.withdrawn')}</Notice></div>;
  }

  return (
    <div className="screen">
      <TopBar title={t('privacy.title')} />
      <div className="page stack-lg" style={{ paddingTop: 6, gap: 20 }}>
        {c.discoverable ? (
          <div className="row" style={{ background: 'var(--teal-50)', borderRadius: 16, padding: '14px 16px', alignItems: 'center' }}>
            <Icon name="eye" size={20} style={{ color: 'var(--teal)' }} />
            <div className="grow small"><span style={{ fontWeight: 600, color: 'var(--teal-ink)' }}>{t('privacy.visibleNow')}</span>
              <div className="xsmall" style={{ color: '#4a6b5d' }}>{t('privacy.profileCode', { code: c.code })}</div></div>
          </div>
        ) : (
          <div className="row" style={{ background: 'var(--sandal)', borderRadius: 16, padding: '14px 16px' }}>
            <Icon name="eyeOff" size={20} style={{ color: 'var(--slate)' }} />
            <div className="grow small"><span style={{ fontWeight: 600 }}>{t('candidateStatus.hidden')}</span>
              <div className="xsmall muted">{t(`candidateStatus.${c.status}`)} · <span className="num">{c.code}</span></div></div>
          </div>
        )}

        <section>
          <div className="kicker" style={{ marginBottom: 10 }}>{t('privacy.visibility')}</div>
          <div className="opt-list" role="radiogroup">
            {(['MEMBERS', 'BROKER_ONLY', 'HIDDEN'] as Visibility[]).map((v) => (
              <OptionRow key={v} name="visibility" title={t(`privacy.visibilityOpts.${v}`)} checked={c.visibility === v} disabled={!!busy}
                onChange={() => void run('vis', () => api.updatePrivacy(id, { visibility: v }))} />
            ))}
          </div>
        </section>

        <section>
          <div className="kicker" style={{ marginBottom: 10 }}>{t('privacy.photo')}</div>
          <div className="opt-list" role="radiogroup">
            {(['GRANT_ONLY', 'MEMBERS'] as PhotoVisibility[]).map((v) => (
              <OptionRow key={v} name="photo" title={t(`privacy.photoOpts.${v}`)} sub={v === 'GRANT_ONLY' ? t('privacy.photoGrantSub') : undefined}
                checked={c.photo_visibility === v} disabled={!!busy}
                onChange={() => void run('photo', () => api.updatePrivacy(id, { photo_visibility: v }))} />
            ))}
          </div>
        </section>

        {(c.family_permissions ?? []).length ? (
          <section>
            <div className="kicker" style={{ marginBottom: 10 }}>{t('privacy.familyAccess')}</div>
            <div className="opt-list">
              {(c.family_permissions ?? []).map((m) => (
                <div key={m.user_id} className="opt" style={{ cursor: 'default' }}>
                  <Avatar label={m.name ?? '?'} small />
                  <div className="grow"><div className="opt-title">{m.name ?? '—'} · {t(`family.relations.${m.relation}`)}</div>
                    <div className="opt-sub">{m.capabilities.length ? m.capabilities.map((cap) => t(`consent.capsShort.${cap}`)).join(', ') : t('privacy.noAccess')}</div></div>
                  <Link to={`/candidates/${id}/consent`} className="link">{t('privacy.manage')}</Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="menu-list">
          {c.status === 'PAUSED' ? (
            <button type="button" disabled={!!busy} onClick={() => void run('resume', () => api.resume(id))}>
              <Icon name="eye" size={20} /><span className="grow">{t('privacy.resume')}</span>{busy === 'resume' ? <span className="spinner" /> : <Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} />}
            </button>
          ) : ['ACTIVE', 'UNDER_REVIEW'].includes(c.status) ? (
            <button type="button" disabled={!!busy} onClick={() => void run('pause', () => api.pause(id))}>
              <Icon name="pause" size={20} /><span className="grow">{t('privacy.pause')}<span className="hint" style={{ display: 'block' }}>{t('privacy.pauseHint')}</span></span>
              {busy === 'pause' ? <span className="spinner" /> : <Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} />}
            </button>
          ) : null}
          <button type="button" className="danger" onClick={() => setWithdrawOpen(true)}>
            <Icon name="logout" size={20} /><span className="grow">{t('privacy.withdraw')}</span><Icon name="chevronRight" size={18} />
          </button>
        </div>
        <p className="hint">{t('privacy.revokeNote')}</p>
        <ErrorNotice error={err} />
      </div>

      <Sheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title={t('privacy.withdraw')}>
        <p>{t('privacy.withdrawHint')}</p>
        <Notice tone="info" icon="alert">{t('privacy.withdrawWarning')}</Notice>
        <Checkbox label={t('privacy.withdrawDelete')} checked={deleteToo} onChange={(e) => setDeleteToo(e.target.checked)} />
        <Button variant="danger-fill" block loading={busy === 'withdraw'}
          onClick={() => void run('withdraw', () => withStepUp(() => api.withdraw(id, deleteToo))).then(() => setWithdrawOpen(false))}>
          {t('privacy.withdrawConfirm')}
        </Button>
      </Sheet>
    </div>
  );
}
