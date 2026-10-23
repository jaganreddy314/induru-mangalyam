import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, CardSkeleton, ErrorNotice, Field, Icon, Input, Notice, Select, Timeline, fmtDate, type Locale, type MembershipStatus, type TimelineState } from '@induru/shared';
import { useSession } from '../app/session';
import { api, qk } from '../lib/api';
import { uploadPrivate } from '../lib/storage';
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES } from '../lib/constants';

const tone = (s: MembershipStatus) => (s === 'APPROVED' ? 'teal' : s === 'NEEDS_INFO' || s === 'UNDER_REVIEW' || s === 'APPLIED' ? 'amber' : s === 'DECLINED' || s === 'SUSPENDED' ? 'rose' : 'slate');

/** M05 + M06 — amber for pending, green only for steps actually completed; optional evidence; NEEDS_INFO response. */
export default function Status() {
  const { t, i18n } = useTranslation();
  const { state, refresh, signOut } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.membership, queryFn: api.myMembership, refetchInterval: 60_000 });
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<(typeof EVIDENCE_TYPES)[number]>('REFERENCE_LETTER');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [refName, setRefName] = useState('');
  const [refPhone, setRefPhone] = useState('');
  const [updating, setUpdating] = useState(false);

  if (!state?.membership) return <Navigate to="/apply" replace />;
  if (q.isLoading) return <div className="page"><CardSkeleton count={2} /></div>;
  if (q.error) return <div className="page"><ErrorNotice error={q.error} onRetry={() => void q.refetch()} /></div>;
  const m = q.data;
  if (!m) return null;
  if (m.status === 'APPROVED' && state.membership.status !== 'APPROVED') void refresh();

  const canUpload = m.case_id && ['APPLIED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(m.status);
  const body = { APPLIED: 'appliedBody', UNDER_REVIEW: 'reviewBody', NEEDS_INFO: 'needsInfoBody', DECLINED: 'declinedBody', SUSPENDED: 'suspendedBody', APPROVED: 'approvedNote' } as const;

  const upload = async () => {
    if (!file || !m.case_id) return;
    if (file.size > MAX_EVIDENCE_BYTES || !/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) {
      return setFileErr(t('status.evidenceTooLarge'));
    }
    setUploading(true); setErr(null); setFileErr(null);
    try {
      const path = await uploadPrivate('evidence', m.case_id, file);
      await api.registerEvidence(m.case_id, type, path);
      setFile(null);
      await qc.invalidateQueries({ queryKey: qk.membership });
    } catch (e) { setErr(e); } finally { setUploading(false); }
  };

  const respond = async () => {
    setUpdating(true); setErr(null);
    try {
      await api.updateMembership({ referral: refName ? { name: refName, phone: refPhone || null } : undefined });
      setRefName(''); setRefPhone('');
      await qc.invalidateQueries({ queryKey: qk.membership });
    } catch (e) { setErr(e); } finally { setUpdating(false); }
  };

  const pendingReview = m.status === 'APPLIED' || m.status === 'UNDER_REVIEW';
  const steps: { state: TimelineState; title: string; sub?: string }[] = [
    { state: 'done', title: t('status.APPLIED'), sub: `${fmtDate(m.submitted_at, i18n.language as Locale)} · ${t('status.ref', { code: m.family_code })}` },
    { state: pendingReview ? 'pending' : 'done', title: t('status.stepReference'), sub: pendingReview ? t('status.stepReferenceSub') : undefined },
    m.status === 'APPROVED' ? { state: 'done', title: t('status.APPROVED'), sub: m.decided_at ? fmtDate(m.decided_at, i18n.language as Locale) : undefined }
      : m.status === 'NEEDS_INFO' ? { state: 'current', title: t('status.NEEDS_INFO'), sub: t('status.stepNeedsInfoSub') }
      : m.status === 'DECLINED' || m.status === 'SUSPENDED' ? { state: 'future', title: t(`status.${m.status}`) }
      : { state: 'future', title: t('status.stepDecision'), sub: t('status.stepDecisionSub') },
  ];

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingTop: 32, gap: 26 }}>
        <div>
          <Badge tone={tone(m.status)} icon={m.status === 'APPROVED' ? 'check' : m.status === 'DECLINED' || m.status === 'SUSPENDED' ? 'circleAlert' : 'clock'}>
            <span style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 12 }}>{t(`status.${m.status}`)}</span>
          </Badge>
          <h1 style={{ fontSize: 32, margin: '14px 0 8px' }}>{t(`status.heading.${m.status}`)}</h1>
          <p className="muted" style={{ fontSize: 15 }}>{t(`status.${body[m.status]}`)}</p>
          <p className="xsmall muted" style={{ marginTop: 6 }}>{m.family_name}</p>
        </div>

        <Timeline large items={steps} />

        {m.applicant_message && (m.status === 'NEEDS_INFO' || m.status === 'DECLINED') ? (
          <Notice tone={m.status === 'NEEDS_INFO' ? 'info' : 'error'}>{m.applicant_message}</Notice>
        ) : null}

        <div className="rule-note"><Icon name="eyeOff" size={20} /><p>{t('status.publishNote')}</p></div>

        {m.status === 'NEEDS_INFO' && m.is_primary ? (
          <section className="stack">
            <h2>{t('status.updateApplication')}</h2>
            <Field label={t('apply.refName')}>{(p) => <Input {...p} value={refName} onChange={(e) => setRefName(e.target.value)} />}</Field>
            <Field label={t('apply.refPhone')} optional>{(p) => <Input {...p} type="tel" value={refPhone} onChange={(e) => setRefPhone(e.target.value)} />}</Field>
            <Button onClick={() => void respond()} loading={updating}>{t('common.submit')}</Button>
          </section>
        ) : null}

        {canUpload ? (
          <section className="stack">
            <div className="stack-sm">
              <h2>{t('status.evidenceTitle')}</h2>
              <p className="muted small">{t('status.evidenceIntro')}</p>
              {m.evidence_count ? <div><Badge tone="teal" icon="fileCheck">{t('status.evidenceCount', { count: m.evidence_count })}</Badge></div> : null}
            </div>
            <Field label={t('status.evidenceType')}>
              {(p) => (
                <Select {...p} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {EVIDENCE_TYPES.map((k) => <option key={k} value={k}>{t(`status.evidenceTypes.${k}`)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('status.evidenceUpload')} error={fileErr ?? undefined} hint={t('status.evidenceRetention')}>
              {(p) => <Input {...p} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
            </Field>
            <Button variant="secondary" onClick={() => void upload()} loading={uploading} disabled={!file}>
              <Icon name="upload" size={18} />{t('status.evidenceUpload')}
            </Button>
          </section>
        ) : null}
        <ErrorNotice error={err} />
      </div>

      <div className="screen-foot">
        {m.status === 'APPROVED' ? <Link to="/" className="btn btn-primary btn-block">{t('common.continue')}</Link> : null}
        <Link to="/help-pending" className="btn btn-secondary btn-block" style={{ minHeight: 52, fontSize: 18 }}><Icon name="lifeBuoy" size={18} />{t('status.contactSupport')}</Link>
        <button type="button" className="link link-muted center" style={{ padding: 8 }} onClick={() => void signOut()}>{t('common.signOut')}</button>
      </div>
    </div>
  );
}
