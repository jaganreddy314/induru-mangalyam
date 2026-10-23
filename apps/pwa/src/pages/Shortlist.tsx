import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CardSkeleton, EmptyState, ErrorNotice, Icon } from '@induru/shared';
import { api, qk } from '../lib/api';
import { ProfileCard } from '../components/ProfileCard';
import { PageHeader } from '../components/Page';

/** M14 — private to the family; the shortlisted person is never notified. */
export default function Shortlist() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.shortlist, queryFn: api.shortlist });
  const remove = async (code: string) => {
    await api.removeShortlist(code);
    await qc.invalidateQueries({ queryKey: qk.shortlist });
  };
  return (
    <div className="page stack" style={{ gap: 12 }}>
      <PageHeader title={t('family.shortlist')} back subtitle={t('family.shortlistEmpty')} />
      {q.isLoading ? <CardSkeleton /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length ? (
        <div className="stack-sm">
          {q.data.map((c) => (
            <div key={c.code} className="stack-sm">
              <ProfileCard card={c} to={`/p/${c.code}`} action={
                <button type="button" className="bookmark-btn" aria-pressed="true" aria-label={t('common.remove')} onClick={(e) => { e.preventDefault(); void remove(c.code); }}>
                  <Icon name="bookmarkCheck" size={19} />
                </button>
              } />
              {c.note ? <p className="quote" style={{ paddingLeft: 16 }}>“{c.note}”</p> : null}
            </div>
          ))}
        </div>
      ) : <EmptyState illustration="emptyMatches" title={t('interests.empty')} />}
    </div>
  );
}
