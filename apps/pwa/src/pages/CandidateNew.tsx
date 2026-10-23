import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorNotice, Icon, Progress, Select, type CandidateRelationship } from '@induru/shared';
import { api, qk } from '../lib/api';
import { BiodataForm, toPayload } from '../components/BiodataForm';
import { useSession } from '../app/session';

const MAIN: CandidateRelationship[] = ['DAUGHTER', 'SON', 'SIBLING'];
const OTHER: CandidateRelationship[] = ['SELF', 'WARD', 'RELATIVE'];

/** M08 — short steps with a progress bar; parent-created drafts stay invisible until the candidate consents. */
export default function CandidateNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { refresh, state } = useSession();
  const [relationship, setRelationship] = useState<CandidateRelationship>(state?.membership?.relation === 'CANDIDATE' ? 'SELF' : 'DAUGHTER');
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<unknown>(null);
  const titles = [t('candidate.stepBasic'), t('candidate.stepAbout'), t('candidate.stepCustoms'), t('candidate.stepReview')];
  const isOther = OTHER.includes(relationship);

  return (
    <div className="screen">
      <div className="page" style={{ paddingTop: 6, paddingBottom: 0 }}>
        <div className="row-between" style={{ height: 44 }}>
          <button type="button" className="icon-btn" style={{ marginLeft: -12 }} onClick={() => (step ? setStep(step - 1) : navigate(-1))}
            aria-label={step ? t('common.back') : t('common.close')}><Icon name={step ? 'arrowLeft' : 'x'} /></button>
          <span className="xsmall muted">{t('apply.subtitle', { step: step + 1, total: 4 })}</span>
          <span style={{ width: 44 }} />
        </div>
        <div style={{ margin: '8px 0 18px' }}><Progress step={step + 1} total={4} /></div>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>{titles[step]}</h1>
        <div className="row xsmall muted" style={{ gap: 8 }}><Icon name="lock" size={14} />{t('candidate.privateDraft')}</div>
      </div>
      <div className="page" style={{ paddingTop: 22 }}>
        <BiodataForm wizardStep={step} onWizardStep={setStep} submitLabel={t('candidate.saveDraft')}
          footer={(button) => <div className="sticky-foot">{button}<ErrorNotice error={err} /></div>}
          onSubmit={async (v) => {
            setErr(null);
            try {
              const { candidate_id } = await api.createDraft({ relationship, ...toPayload(v) });
              await Promise.all([qc.invalidateQueries({ queryKey: qk.familyCandidates }), refresh()]);
              navigate(relationship === 'SELF' ? `/candidates/${candidate_id}/consent` : `/candidates/${candidate_id}/invite`, { replace: true });
            } catch (e) { setErr(e); }
          }}>
          <div className="field">
            <span className="label" id="rel-l">{t('candidate.relationship')}</span>
            <div className="segmented" role="group" aria-labelledby="rel-l" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {MAIN.map((r) => (
                <button key={r} type="button" aria-pressed={relationship === r} onClick={() => setRelationship(r)}>{t(`candidate.relationshipShort.${r}`)}</button>
              ))}
              <button type="button" aria-pressed={isOther} onClick={() => !isOther && setRelationship('SELF')}>{t('candidate.other')}</button>
            </div>
            {isOther ? (
              <Select aria-label={t('candidate.relationship')} value={relationship} onChange={(e) => setRelationship(e.target.value as CandidateRelationship)} style={{ marginTop: 8 }}>
                {OTHER.map((r) => <option key={r} value={r}>{t(`candidate.relationships.${r}`)}</option>)}
              </Select>
            ) : null}
          </div>
        </BiodataForm>
      </div>
    </div>
  );
}
