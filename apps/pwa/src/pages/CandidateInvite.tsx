import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardSkeleton, ErrorNotice, Field, Icon, Illustration, Input, fmtDate, toE164, type Locale } from '@induru/shared';
import { api, qk } from '../lib/api';
import { inviteLink } from '../lib/invite';
import { InviteLink } from '../components/InviteLink';
import { TopBar } from '../components/Page';

/** M09 — adult self-agency, never coercion. The parent's session cannot complete consent; stated before sending. */
export default function CandidateInvite() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.candidate(id), queryFn: () => api.candidate(id) });
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (q.isLoading) return <div className="page"><CardSkeleton count={2} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} /></div>;
  const c = q.data!;
  if (c.claimed) return <Navigate to={`/candidates/${id}`} replace />;
  const name = c.details.first_name;

  const create = async () => {
    const e164 = toE164(phone);
    if (!e164) return setPhoneErr(t('auth.invalidPhone'));
    setBusy(true); setErr(null); setPhoneErr(null);
    try {
      const r = await api.createCandidateInvitation(c.id, e164);
      setLink(inviteLink(r.token));
      await Promise.all([qc.invalidateQueries({ queryKey: qk.candidate(id) }), qc.invalidateQueries({ queryKey: qk.familyCandidates })]);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <TopBar onLead={() => navigate(`/candidates/${id}`)} />
      <div className="screen-body" style={{ paddingTop: 0, gap: 22 }}>
        <div className="illus-slot"><Illustration name="familyInvitation" small /></div>
        <div>
          <h1 style={{ marginBottom: 8 }}>{t('candidate.inviteHeading', { name })}</h1>
          <p className="muted" style={{ fontSize: 15 }}>{t('candidate.inviteLead')}</p>
        </div>
        {link ? <InviteLink link={link} shareText={t('candidate.inviteShareText', { link })} note={t('candidate.inviteReady', { name })} /> : (
          <>
            <Field label={t('candidate.invitePhoneOf', { name })} error={phoneErr ?? undefined}
              hint={c.pending_invitation ? `${t('candidate.invitePending', { last4: c.pending_invitation.phone_last4 })} · ${t('common.expiresOn', { date: fmtDate(c.pending_invitation.expires_at, i18n.language as Locale) })}` : undefined}>
              {(p) => (
                <div className="input-prefix"><span>+91</span>
                  <Input {...p} type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="90000 00000" />
                </div>
              )}
            </Field>
            <div className="stack rule-top" style={{ gap: 12, paddingTop: 18 }}>
              <div className="info-row"><Icon name="smartphone" size={18} />{t('candidate.invitePoint1')}</div>
              <div className="info-row"><Icon name="pencil" size={18} />{t('candidate.invitePoint2')}</div>
              <div className="info-row"><Icon name="key" size={18} />{t('candidate.invitePoint3')}</div>
            </div>
            <ErrorNotice error={err} />
          </>
        )}
      </div>
      <div className="screen-foot">
        {link ? <Button block variant="secondary" onClick={() => navigate('/', { replace: true })}>{t('common.done')}</Button> : (
          <>
            <div className="center xsmall muted">{t('candidate.inviteExpiry')}</div>
            <Button block loading={busy} onClick={() => void create()}>{c.pending_invitation ? t('candidate.inviteResend') : t('candidate.inviteSend')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
