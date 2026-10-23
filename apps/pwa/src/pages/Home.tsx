import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Avatar, CardSkeleton, EmptyState, ErrorNotice, Icon, fmtRelative, type IconName, type Locale } from '@induru/shared';
import { isCandidateUser, useMe } from '../app/session';
import { BellLink } from '../app/Layout';
import { api, qk } from '../lib/api';
import { CandidateStatusBadge } from '../components/status';
import { notificationKey, notificationLink } from '../lib/notifications';

interface Task { to: string; text: string; sub?: string; icon: IconName; tone: 'amber' | 'maroon' | 'teal' }
const TASK_BG = { amber: ['var(--amber-50)', 'var(--amber)'], maroon: ['var(--maroon-50)', 'var(--maroon)'], teal: ['var(--teal-50)', 'var(--teal)'] } as const;

/** M07 — sandal header with one compact badge naming the actual check; tasks first; decisions belong to the candidate. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const candidateUser = isCandidateUser(me);
  const cands = useQuery({ queryKey: qk.familyCandidates, queryFn: api.familyCandidates });
  const received = useQuery({ queryKey: qk.interests('RECEIVED'), queryFn: () => api.interests('RECEIVED') });
  const sent = useQuery({ queryKey: qk.interests('SENT'), queryFn: () => api.interests('SENT') });
  const intros = useQuery({ queryKey: qk.introductions, queryFn: api.introductions });
  const notifs = useQuery({ queryKey: qk.notifications, queryFn: api.notifications });

  const tasks: Task[] = [];
  const mine = (cands.data ?? []).filter((c) => !candidateUser || c.is_owner);
  for (const c of mine) {
    if (c.is_owner && c.status === 'AWAITING_CONSENT') tasks.push({ to: `/candidates/${c.id}/consent`, text: t('home.taskConsent'), icon: 'userCheck', tone: 'maroon' });
    else if (!c.claimed && c.status === 'DRAFT') tasks.push({ to: `/candidates/${c.id}`, text: t('home.taskInviteCandidate', { name: c.first_name }), sub: t('home.taskInviteSub'), icon: 'mail', tone: 'amber' });
    else if (!c.is_owner && c.status === 'AWAITING_CONSENT') tasks.push({ to: `/candidates/${c.id}`, text: t('home.taskAwaitingConsent', { name: c.first_name }), sub: t('home.taskAwaitingConsentSub'), icon: 'mail', tone: 'amber' });
    else if (c.status === 'UNDER_REVIEW') tasks.push({ to: `/candidates/${c.id}`, text: t('home.taskReview', { name: c.first_name }), icon: 'clock', tone: 'teal' });
  }
  const decideReceived = (received.data ?? []).filter((r) => r.can_decide).length;
  const decide = decideReceived + (sent.data ?? []).filter((r) => r.can_decide).length;
  if (decide) tasks.push({ to: `${candidateUser ? '/requests' : '/interests'}?box=${decideReceived ? 'RECEIVED' : 'SENT'}`, text: t('home.taskDecide', { count: decide }), icon: 'inbox', tone: 'maroon' });
  const pendingIntro = (intros.data ?? []).find((i) => i.stage === 'PENDING_CONTACT');
  if (pendingIntro) tasks.push({ to: `/introductions/${pendingIntro.id}`, text: t('home.taskContact'), icon: 'smartphone', tone: 'maroon' });

  const loading = cands.isLoading || received.isLoading;
  return (
    <div>
      <header className="sandal-head">
        <div className="inner row-between" style={{ alignItems: 'flex-start', paddingTop: 18 }}>
          <div>
            <div lang="te" className="te" style={{ fontWeight: 500, fontSize: 14, color: 'var(--slate)' }}>నమస్కారం</div>
            <h1 style={{ margin: '2px 0 10px' }}>{me.user.display_name ?? me.membership?.family_name}</h1>
            {me.membership?.status === 'APPROVED'
              ? <span className="badge badge-teal" style={{ fontSize: 12, padding: '4px 10px' }}><Icon name="shieldCheck" size={14} />{t('badges.family_verified')}</span>
              : null}
          </div>
          <BellLink />
        </div>
      </header>

      <div className="page stack-lg" style={{ paddingTop: 20 }}>
        {loading ? <CardSkeleton count={2} /> : cands.error ? <ErrorNotice error={cands.error} onRetry={() => void cands.refetch()} /> : tasks.length ? (
          <section className="stack-sm" aria-label={t('home.tasks')}>
            {tasks.map((task, i) => (
              <Link key={i} to={task.to} className="card card-raised card-link row" style={{ alignItems: 'flex-start', gap: 14 }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: TASK_BG[task.tone][0], color: TASK_BG[task.tone][1], display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon name={task.icon} size={19} />
                </span>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{task.text}</span>
                  {task.sub ? <span className="xsmall muted">{task.sub}</span> : null}
                  <span className="link" style={{ display: 'block', marginTop: 8 }}>{t('common.open')}</span>
                </span>
              </Link>
            ))}
          </section>
        ) : <div className="info-row muted"><Icon name="check" size={18} style={{ color: 'var(--teal)' }} />{t('home.noTasks')}</div>}

        {!candidateUser ? (
          <section aria-labelledby="cands-h">
            <div className="row-between" style={{ marginBottom: 10, alignItems: 'baseline' }}>
              <h2 id="cands-h">{t('home.candidates')}</h2>
              <Link to="/candidates/new" className="link">+ {t('home.add')}</Link>
            </div>
            {cands.data && !cands.data.length ? (
              <div className="card"><EmptyState illustration="familyInvitation" title={t('home.noCandidates')}>
                <Link to="/candidates/new" className="btn btn-primary">{t('home.addCandidate')}</Link>
              </EmptyState></div>
            ) : (
              <div className="card card-flush list">
                {(cands.data ?? []).map((c) => (
                  <Link key={c.id} to={`/candidates/${c.id}`} className="list-item" style={{ gap: 14 }}>
                    <Avatar label={c.first_name} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{c.first_name}</div>
                      <div className="xsmall muted">{t(`candidate.relationshipShort.${c.relationship}`)} · {c.status === 'DRAFT' ? t('candidateStatus.DRAFT') : <span className="num">{c.code}</span>}</div>
                    </div>
                    <CandidateStatusBadge status={c.status} suspended={c.suspended} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section aria-labelledby="upd-h">
          <div className="row-between" style={{ marginBottom: 10, alignItems: 'baseline' }}>
            <h2 id="upd-h">{t('home.updates')}</h2>
            <Link to="/notifications" className="link">{t('home.viewAll')}</Link>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            {(notifs.data ?? []).slice(0, 4).map((n) => (
              <Link key={n.id} to={notificationLink(n)} className="info-row" style={{ color: 'inherit', textDecoration: 'none' }}>
                <Icon name="bell" size={18} />
                <span className="grow" style={{ fontWeight: n.status === 'UNREAD' ? 600 : 400 }}>
                  {t(notificationKey(n.template_key), { defaultValue: t('notif.fallback') })}
                  <span className="xsmall muted" style={{ display: 'block', fontWeight: 400 }}>{fmtRelative(n.created_at, i18n.language as Locale)}</span>
                </span>
              </Link>
            ))}
            {notifs.data && !notifs.data.length ? <p className="muted small">{t('notifications.empty')}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
