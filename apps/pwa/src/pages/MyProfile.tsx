import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, ErrorNotice, Icon, Notice } from '@induru/shared';
import { useMe } from '../app/session';
import { api, qk } from '../lib/api';
import { PageHeader } from '../components/Page';
import { CandidateStatusBadge } from '../components/status';
import { ProfileCard } from '../components/ProfileCard';
import { BellLink } from '../app/Layout';

/** Candidate navigation “My profile”: status, public preview, consent, privacy, family. */
export default function MyProfile() {
  const { t } = useTranslation();
  const me = useMe();
  const id = me.own_candidate?.id;
  const q = useQuery({ queryKey: qk.candidate(id ?? ''), enabled: !!id, queryFn: () => api.candidate(id!) });
  if (!id) return <Navigate to="/candidates/new" replace />;
  if (q.isLoading) return <div className="page"><CardSkeleton count={2} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} /></div>;
  const c = q.data!;
  const preview = { code: c.code, age: c.age, profession: c.details.profession, city: c.details.city, district: c.details.district };

  return (
    <div className="page stack-lg">
      <PageHeader title={c.details.first_name} kicker={<span className="num">{c.code}</span>} action={<BellLink />} />
      <div className="row wrap" style={{ gap: 6, marginTop: -8 }}>
        <CandidateStatusBadge status={c.status} suspended={c.suspended} />
        <span className="xsmall muted">{c.discoverable ? t('candidateStatus.visible') : t('candidateStatus.hidden')}</span>
      </div>
      <section>
        <div className="kicker" style={{ marginBottom: 8 }}>{t('candidate.publicPreview')}</div>
        <ProfileCard card={{ ...preview, verified: c.verified }} />
      </section>
      {c.status === 'AWAITING_CONSENT' ? (
        <Link to={`/candidates/${id}/consent`} className="card card-raised card-link row">
          <Icon name="userCheck" size={20} style={{ color: 'var(--maroon)' }} /><span className="grow" style={{ fontWeight: 600 }}>{t('home.taskConsent')}</span><Icon name="chevronRight" size={18} />
        </Link>
      ) : null}
      {c.review_message ? <Notice tone="info">{c.review_message}</Notice> : null}
      <nav className="menu-list">
        {([
          [`/candidates/${id}`, 'pencil', t('candidate.editTitle')],
          [`/candidates/${id}/consent`, 'userCheck', t('consent.title')],
          [`/candidates/${id}/privacy`, 'lock', t('privacy.title')],
          ['/family', 'users', t('family.title')],
          ['/discover', 'compass', t('discover.title')],
          ['/settings', 'settings', t('settings.title')],
          ['/help', 'lifeBuoy', t('family.help')],
        ] as const).map(([to, icon, label]) => (
          <Link key={to} to={to}><Icon name={icon} size={20} /><span className="grow">{label}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></Link>
        ))}
      </nav>
    </div>
  );
}
