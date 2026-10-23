import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, CardSkeleton, ErrorNotice, Icon, Illustration, Notice } from '@induru/shared';
import { useSession } from '../app/session';
import { api } from '../lib/api';
import { clearInviteToken, pendingInviteToken, rememberInviteToken } from '../lib/invite';

/** M09 — accepting a family-member or candidate invitation with one's own phone. */
export default function Join() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useSession();
  const token = params.get('t') ?? pendingInviteToken();
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) rememberInviteToken(token); }, [token]);
  const q = useQuery({ queryKey: ['invitation', token], enabled: !!token, queryFn: () => api.getInvitation(token!) });

  if (!token) return <div className="page"><Notice tone="error">{t('errors.NOT_FOUND')}</Notice></div>;
  if (q.isLoading) return <div className="page"><CardSkeleton count={1} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} /></div>;
  const inv = q.data!;

  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.acceptInvitation(token);
      clearInviteToken();
      await refresh();
      navigate(r.candidate_id ? `/candidates/${r.candidate_id}/consent` : '/', { replace: true });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="page stack-lg">
      <h1>{t('join.title')}</h1>
      <Illustration name={inv.kind === 'CANDIDATE' ? 'candidateConsent' : 'familyInvitation'} />
      <div className="card stack">
        <div className="row"><Icon name="users" /><p>{inv.kind === 'CANDIDATE'
          ? t('join.candidateInvite', { family: inv.family_name })
          : t('join.familyInvite', { family: inv.family_name })}</p></div>
        {inv.expired ? <Notice tone="error">{t('join.expired')}</Notice>
          : inv.used ? <Notice tone="neutral">{t('join.used')}</Notice>
          : !inv.phone_matches ? <Notice tone="error">{t('join.wrongPhone')} {t('join.signInFirst')}</Notice>
          : <Button block onClick={() => void accept()} loading={busy}>{t('join.accept')}</Button>}
        <ErrorNotice error={err} />
      </div>
    </div>
  );
}
