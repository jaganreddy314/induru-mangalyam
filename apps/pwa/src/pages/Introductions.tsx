import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, EmptyState, ErrorNotice, Icon, fmtRelative, type Locale } from '@induru/shared';
import { api, qk } from '../lib/api';
import { StageBadge } from '../components/status';
import { cardTitle } from '../components/ProfileCard';

/** M17 list — introductions exist only after both candidates accepted. */
export default function Introductions() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: qk.introductions, queryFn: api.introductions });
  return (
    <div className="page stack" style={{ paddingTop: 16, gap: 12 }}>
      <h1 style={{ marginBottom: 4 }}>{t('intro.title')}</h1>
      {q.isLoading ? <CardSkeleton count={2} /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length ? (
        q.data.map((i) => (
          <Link key={i.id} to={`/introductions/${i.id}`} className="icard card-link">
            <div className="row">
              <span className="avatar avatar-ring"><Icon name="link" size={18} /></span>
              <div className="grow">
                <div className="icard-title">{i.my_candidate.first_name} &amp; <span className="num">{i.other.code}</span></div>
                <div className="xsmall muted">{i.other.unavailable ? t('common.unavailable') : cardTitle(i.other)} · {fmtRelative(i.updated_at, i18n.language as Locale)}</div>
              </div>
              <Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} />
            </div>
            <div><StageBadge stage={i.stage} /></div>
          </Link>
        ))
      ) : <EmptyState illustration="mutualIntroduction" title={t('intro.empty')} />}
    </div>
  );
}
