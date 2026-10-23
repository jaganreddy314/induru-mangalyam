import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardSkeleton, ErrorNotice, Icon, Illustration, Notice, Tick, ToggleRow, type Capability, type ConsentType } from '@induru/shared';
import { api, qk } from '../lib/api';
import { useStepUp } from '../app/stepUp';
import { useSession } from '../app/session';
import { TopBar } from '../components/Page';

const CAPS: Capability[] = ['EDIT_BIODATA', 'SUGGEST_INTEREST', 'VIEW_INTERESTS', 'COORDINATE_MEETINGS'];

/** M10 — separate toggles for participation and publication; family permissions granted capability by
 *  capability; versioned consent recorded with a fresh sign-in. Candidate-only. */
export default function Consent() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const withStepUp = useStepUp();
  const { refresh } = useSession();
  const q = useQuery({ queryKey: qk.candidate(id), queryFn: () => api.candidate(id) });
  const [step, setStep] = useState(0);
  const [consents, setConsents] = useState<Record<ConsentType, boolean>>({ PARTICIPATE: false, PUBLISH: false, TRADITIONAL_DETAILS: false });
  const [perms, setPerms] = useState<Record<string, Capability[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setConsents({ PARTICIPATE: !!q.data.consents.PARTICIPATE, PUBLISH: !!q.data.consents.PUBLISH, TRADITIONAL_DETAILS: !!q.data.consents.TRADITIONAL_DETAILS });
    setPerms(Object.fromEntries((q.data.family_permissions ?? []).map((f) => [f.user_id, f.capabilities])));
  }, [q.data]);

  if (q.isLoading) return <div className="page"><CardSkeleton count={3} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} /></div>;
  const c = q.data!;
  if (!c.is_owner) return <Navigate to={`/candidates/${id}`} replace />;
  const d = c.details;
  const firstTime = !c.consents.PARTICIPATE;
  const filled = [d.first_name, d.gender, d.dob, d.marital_status, d.height_cm, d.education, d.profession, d.city, d.bio].filter((x) => x != null && x !== '').length;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await withStepUp(() => api.recordConsents(id, consents,
        Object.entries(perms).map(([user_id, capabilities]) => ({ user_id, capabilities })), c.version));
      await Promise.all([qc.invalidateQueries({ queryKey: qk.candidate(id) }), qc.invalidateQueries({ queryKey: qk.familyCandidates }), refresh()]);
      setDone(true);
    } catch (e) {
      if (!(e instanceof Error && e.message === 'cancelled')) setErr(e);
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="screen">
        <div className="screen-body" style={{ paddingTop: 48 }}>
          <Illustration name="candidateConsent" small />
          <h1>{t('consent.recorded')}</h1>
          <p className="muted">{t('consent.alwaysYou')}</p>
        </div>
        <div className="screen-foot"><Button block onClick={() => navigate('/', { replace: true })}>{t('common.continue')}</Button></div>
      </div>
    );
  }

  const familyMembers = c.family_permissions ?? [];
  return (
    <div className="screen">
      {step === 0 ? <TopBar /> : <TopBar onLead={() => setStep(0)} />}
      <div className="screen-body" style={{ paddingTop: 0, gap: 20 }}>
        <div>
          <div className="kicker">{t('apply.subtitle', { step: step + 1, total: 2 })} · {step === 0 ? t('consent.stepReview') : t('consent.stepDecisions')}</div>
          <h1 style={{ margin: '6px 0 8px' }}>{step === 0 ? t('consent.title') : t('consent.decisionTitle')}</h1>
          <p className="small muted">{step === 0 ? t('consent.intro') : t('consent.nothingShared')}</p>
        </div>

        {step === 0 ? (
          <div className="card">
            <dl className="kv">
              <dt>{t('candidate.firstName')}</dt><dd>{d.first_name}</dd>
              <dt>{t('candidate.gender')}</dt><dd>{t(`candidate.genders.${d.gender}`)}</dd>
              <dt>{t('candidate.dob')}</dt><dd className="num">{d.dob}</dd>
              <dt>{t('candidate.maritalStatus')}</dt><dd>{t(`candidate.marital.${d.marital_status}`)}</dd>
              <dt>{t('candidate.height')}</dt><dd>{d.height_cm ?? '—'}</dd>
              <dt>{t('candidate.education')}</dt><dd>{d.education ?? '—'}</dd>
              <dt>{t('candidate.profession')}</dt><dd>{d.profession ?? '—'}</dd>
              <dt>{t('candidate.city')}</dt><dd>{[d.city, d.district, d.state].filter(Boolean).join(', ') || '—'}</dd>
              <dt>{t('candidate.bio')}</dt><dd style={{ whiteSpace: 'pre-line' }}>{d.bio ?? '—'}</dd>
              <dt>{t('candidate.familySummary')}</dt><dd style={{ whiteSpace: 'pre-line' }}>{d.family_summary ?? '—'}</dd>
              {Object.entries(d.customs ?? {}).map(([k, v]) => <span key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></span>)}
            </dl>
          </div>
        ) : (
          <>
            <div className="card row" style={{ padding: '14px 16px', gap: 12 }}>
              <Icon name="fileCheck" size={20} style={{ color: 'var(--teal)' }} />
              <div className="grow small"><span style={{ fontWeight: 600 }}>{t('consent.detailsReviewed')}</span>
                <div className="xsmall muted">{t('consent.fieldsFilled', { n: filled, total: 9 })}</div></div>
              <button type="button" className="link" onClick={() => setStep(0)}>{t('common.view')}</button>
            </div>
            <div className="opt-list">
              <ToggleRow title={t('consent.participate')} sub={t('consent.participateHint')} checked={consents.PARTICIPATE}
                onChange={(e) => setConsents({ ...consents, PARTICIPATE: e.target.checked, PUBLISH: e.target.checked && consents.PUBLISH })} />
              <ToggleRow title={t('consent.publish')} sub={t('consent.publishHint')} checked={consents.PUBLISH} disabled={!consents.PARTICIPATE}
                onChange={(e) => setConsents({ ...consents, PUBLISH: e.target.checked })} />
              <ToggleRow title={t('consent.traditional')} checked={consents.TRADITIONAL_DETAILS}
                onChange={(e) => setConsents({ ...consents, TRADITIONAL_DETAILS: e.target.checked })} />
            </div>
            {familyMembers.length ? familyMembers.map((m) => (
              <div key={m.user_id}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t('consent.whatCanDo', { name: m.name ?? t(`family.relations.${m.relation}`), relation: t(`family.relations.${m.relation}`).toLowerCase() })}</div>
                <div className="stack-sm" style={{ gap: 9 }}>
                  {CAPS.map((cap) => (
                    <Tick key={cap} label={t(`consent.caps.${cap}`)} checked={(perms[m.user_id] ?? []).includes(cap)}
                      onChange={(e) => setPerms({ ...perms, [m.user_id]: e.target.checked
                        ? [...(perms[m.user_id] ?? []), cap] : (perms[m.user_id] ?? []).filter((x) => x !== cap) })} />
                  ))}
                </div>
              </div>
            )) : <p className="muted small">{t('consent.noFamily')}</p>}
            <Notice tone="neutral" icon="shield">{t('consent.alwaysYou')}</Notice>
            <ErrorNotice error={err} />
          </>
        )}
      </div>
      <div className="screen-foot ruled">
        {step === 0 ? (
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
            <Link to={`/candidates/${id}`} className="btn btn-secondary" style={{ fontSize: 18 }}>{t('consent.editFirst')}</Link>
            <Button onClick={() => setStep(1)} style={{ fontSize: 18 }}>{t('consent.looksRight')}</Button>
          </div>
        ) : (
          <>
            <div className="center" style={{ fontSize: 12, color: 'var(--slate)' }}>{t('consent.recordedWith')}</div>
            <Button block onClick={() => void submit()} loading={busy}>{firstTime ? t('consent.give') : t('consent.update')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
