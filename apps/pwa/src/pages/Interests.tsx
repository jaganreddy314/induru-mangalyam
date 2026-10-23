import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, CardSkeleton, EmptyState, ErrorNotice, Icon, Sheet, fmtRelative, type IconName, type InterestRow, type Locale } from '@induru/shared';
import { api, qk } from '../lib/api';
import { cardTitle } from '../components/ProfileCard';
import { isCandidateUser, useMe } from '../app/session';

const BOXES = ['RECEIVED', 'SENT', 'CLOSED'] as const;
type Box = (typeof BOXES)[number];

/** M16 — family view sees status, but the decision button lives only in the candidate's app.
 *  "Closed" replaces "Declined" to avoid pressure; declines never carry a reason. */
export default function Interests() {
  const { t } = useTranslation();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const box = (BOXES.includes(params.get('box') as Box) ? params.get('box') : 'RECEIVED') as Box;
  const q = useQuery({ queryKey: qk.interests(box), queryFn: () => api.interests(box) });
  const label = { RECEIVED: t('interests.received'), SENT: t('interests.sent'), CLOSED: t('interests.closed') };

  return (
    <div>
      <div className="page" style={{ paddingTop: 16, paddingBottom: 0 }}>
        <h1 style={{ marginBottom: 14 }}>{isCandidateUser(me) ? t('nav.requests') : t('interests.title')}</h1>
        <div className="tabs" role="tablist">
          {BOXES.map((b) => (
            <button key={b} role="tab" aria-selected={box === b} onClick={() => setParams({ box: b }, { replace: true })}>
              {label[b]}{box === b && b !== 'CLOSED' && q.data?.length ? ` · ${q.data.length}` : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="page stack" style={{ paddingTop: 16, gap: 12 }}>
        {q.isLoading ? <CardSkeleton count={2} /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length ? (
          q.data.map((row, i) => <InterestItem key={row.id} row={row} raised={i === 0} />)
        ) : <EmptyState illustration="emptyMatches" title={t('interests.empty')} />}
        <div className="info-row rule-top xsmall muted" style={{ paddingTop: 14, lineHeight: 1.5 }}>
          <Icon name="info" size={16} style={{ color: 'var(--slate)', marginTop: 2 }} />{t('interests.footNote')}
        </div>
      </div>
    </div>
  );
}

function InterestItem({ row, raised }: { row: InterestRow; raised?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'ACCEPT' | 'DECLINE' | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const name = row.my_candidate.first_name;

  const decide = async (d: 'ACCEPT' | 'DECLINE') => {
    setBusy(d); setErr(null);
    try {
      await api.decide(row.id, d);
      setConfirmDecline(false);
      await Promise.all(['interests', 'introductions', 'session'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  const mutual = row.status === 'MUTUALLY_ACCEPTED';
  const closed = row.status === 'DECLINED' || row.status === 'EXPIRED';
  const sourcePending = row.status === 'INTEREST_PENDING' && row.side === 'SOURCE';
  const waitingOnMine = (row.status === 'AWAITING_CANDIDATE' && row.side === 'TARGET') || sourcePending || (row.status === 'SUGGESTED' && !row.my_decision);
  const status: { icon: IconName; cls: string; text: string } = mutual
    ? { icon: 'checkCheck', cls: 'teal', text: t('interests.status.MUTUALLY_ACCEPTED') }
    : closed ? { icon: 'circle', cls: 'slate', text: t('interests.closedLabel') }
    : row.can_decide ? { icon: 'clock', cls: 'amber', text: t('interests.yourDecision') }
    : waitingOnMine ? { icon: 'clock', cls: 'amber', text: t('interests.awaitingName', { name }) }
    : { icon: 'clock', cls: 'amber', text: t(`interests.status.${row.status}`) };

  return (
    <article className={`icard${raised ? ' card-raised' : ''}`}>
      <Link to={`/p/${row.other.code}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
        {mutual ? <span className="avatar avatar-ring"><Icon name="link" size={18} /></span> : <Avatar label={row.other.code} locked />}
        <div className="grow">
          <div className="icard-title"><span className="num">{row.other.code}</span>{row.other.unavailable ? '' : ` · ${cardTitle(row.other).replace(' · ', ', ')}`}</div>
          <div className="xsmall muted">{t('interests.forCandidate', { name })} · {fmtRelative(row.created_at, i18n.language as Locale)}</div>
        </div>
      </Link>
      {row.via === 'BROKER' ? <p className="xsmall muted row" style={{ gap: 6 }}><Icon name="brokerAssisted" size={15} />{t('interests.viaBroker')}</p> : null}
      {row.via === 'FAMILY' && row.side === 'SOURCE' ? <p className="xsmall muted">{t('interests.viaFamily')}</p> : null}
      {row.message && (row.side === 'TARGET' || sourcePending) ? <p className="quote">“{row.message}”</p> : null}
      {row.my_decision === 'ACCEPT' && !mutual ? <p className="xsmall" style={{ color: 'var(--teal)' }}>{t('interests.youAccepted')}</p> : null}
      {row.can_decide ? (
        <div className="grid-2">
          <Button variant="secondary" small onClick={() => setConfirmDecline(true)}>{t('interests.decline')}</Button>
          <Button small onClick={() => void decide('ACCEPT')} loading={busy === 'ACCEPT'}>{sourcePending ? t('interests.confirmSend') : t('interests.accept')}</Button>
        </div>
      ) : null}
      <div className="row-between">
        <span className={`status-line ${status.cls}`}><Icon name={status.icon} size={14} />{status.text}</span>
        {row.introduction_id ? <Link to={`/introductions/${row.introduction_id}`} className="link">{t('interests.openIntroduction')}</Link> : null}
      </div>
      <ErrorNotice error={err} />
      <Sheet open={confirmDecline} onClose={() => setConfirmDecline(false)} title={t('interests.decline')}>
        <p className="muted">{t('interests.declineConfirm')}</p>
        <Button block variant="danger" loading={busy === 'DECLINE'} onClick={() => void decide('DECLINE')}>{t('interests.decline')}</Button>
      </Sheet>
    </article>
  );
}
