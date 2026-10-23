import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, CardSkeleton, Checkbox, ErrorNotice, Field, Icon, Input, Notice, Textarea, fmtDate, toE164,
  type CandidateEdit as CandidateEditT, type Locale } from '@induru/shared';
import { api, qk } from '../lib/api';
import { PageHeader } from '../components/Page';
import { BiodataForm, toPayload } from '../components/BiodataForm';
import { CandidateStatusBadge } from '../components/status';
import { signedPhotoUrl, uploadPrivate } from '../lib/storage';
import { MAX_PHOTO_BYTES } from '../lib/constants';

/** Candidate hub for family and candidate: status, invitation (M09), biodata (M08), preferences, photo, contact. */
export default function CandidateEdit() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.candidate(id), queryFn: () => api.candidate(id) });
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  if (q.isLoading) return <div className="page"><CardSkeleton count={3} /></div>;
  if (q.error) return <div className="page"><PageHeader title={t('candidate.editTitle')} back /><ErrorNotice error={q.error} /></div>;
  const c = q.data!;
  const canEdit = c.my_capabilities.includes('EDIT_BIODATA') && !['WITHDRAWN', 'ARCHIVED'].includes(c.status);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.candidate(id) }), qc.invalidateQueries({ queryKey: qk.familyCandidates })]);

  return (
    <div className="page stack-lg">
      <PageHeader title={c.details.first_name} back kicker={<span className="num">{c.code}</span>} />
      <div className="row wrap" style={{ gap: 6, marginTop: -8 }}>
        <CandidateStatusBadge status={c.status} suspended={c.suspended} />
        {c.status === 'ACTIVE' ? <Badge tone={c.discoverable ? 'teal' : 'slate'}>{c.discoverable ? t('candidateStatus.visible') : t('candidateStatus.hidden')}</Badge> : null}
      </div>
      {c.review_message ? <Notice tone="info"><strong>{t('candidate.reviewMessage')}:</strong> {c.review_message}</Notice> : null}

      {c.is_owner ? (
        <div className="card card-flush list">
          <Link to={`/candidates/${id}/consent`} className="list-item"><Icon name="userCheck" size={20} /><span className="grow">{t('consent.title')}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></Link>
          <Link to={`/candidates/${id}/privacy`} className="list-item"><Icon name="lock" size={20} /><span className="grow">{t('privacy.title')}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></Link>
        </div>
      ) : null}

      {!c.claimed ? (
        <Link to={`/candidates/${id}/invite`} className="card card-raised card-link row" style={{ alignItems: 'flex-start', gap: 14 }}>
          <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--amber-50)', color: 'var(--amber)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="mail" size={19} /></span>
          <span className="grow">
            <span style={{ display: 'block', fontWeight: 600 }}>{c.pending_invitation ? t('candidate.invitePending', { last4: c.pending_invitation.phone_last4 }) : t('candidate.inviteTitle')}</span>
            <span className="xsmall muted">{c.pending_invitation ? t('common.expiresOn', { date: fmtDate(c.pending_invitation.expires_at, i18n.language as Locale) }) : t('candidate.inviteLead')}</span>
            <span className="link" style={{ display: 'block', marginTop: 8 }}>{c.pending_invitation ? t('candidate.inviteResend') : t('candidate.inviteSend')}</span>
          </span>
        </Link>
      ) : null}

      <section className="stack-sm">
        <h2>{t('candidate.editTitle')}</h2>
        {!canEdit ? <p className="info-row muted"><Icon name="lock" size={18} />{t('candidate.noPermission')}</p> : null}
        <div className="card">
          <BiodataForm initial={c.details} disabled={!canEdit} showMaterialNote={c.status === 'ACTIVE'} submitLabel={saved ? t('common.saved') : t('common.save')}
            onSubmit={async (v) => {
              setErr(null); setSaved(false);
              try { await api.updateDetails(id, toPayload(v)); await refresh(); setSaved(true); } catch (e) { setErr(e); }
            }} />
        </div>
        <ErrorNotice error={err} />
      </section>

      {canEdit ? <PhotoSection c={c} onDone={refresh} /> : null}
      {canEdit ? <PreferencesSection c={c} onDone={refresh} /> : null}
      {c.is_owner ? <ContactSection c={c} onDone={refresh} /> : null}
    </div>
  );
}

function PhotoSection({ c, onDone }: { c: CandidateEditT; onDone: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const photo = useQuery({
    queryKey: ['own-photo', c.details.photo_path],
    enabled: !!c.details.photo_path,
    queryFn: () => signedPhotoUrl(c.details.photo_path!),
  });

  const upload = async (file: File) => {
    if (file.size > MAX_PHOTO_BYTES || !/^image\/(jpeg|png|webp)$/.test(file.type)) return setFileErr('JPG / PNG / WebP, < 3 MB');
    setBusy(true); setErr(null); setFileErr(null);
    try {
      const path = await uploadPrivate('photos', c.id, file);
      await api.setPhoto(c.id, path);
      await onDone();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <section className="stack-sm">
      <h2>{t('candidate.photo')}</h2>
      <div className="card stack">
        <div className="row">
          <div className="plate">{photo.data ? <img src={photo.data} alt="" /> : <Icon name="image" size={22} />}</div>
          <div className="stack-sm grow">
            {c.details.photo_path ? <Badge tone={c.details.photo_approved ? 'teal' : 'amber'}>{c.details.photo_approved ? t('candidate.photoApproved') : t('candidate.photoPending')}</Badge> : null}
            <p className="hint">{t('candidate.photoHint')}</p>
          </div>
        </div>
        <Field label={t('candidate.photoUpload')} error={fileErr ?? undefined}>
          {(p) => <Input {...p} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />}
        </Field>
        <ErrorNotice error={err} />
      </div>
    </section>
  );
}

function PreferencesSection({ c, onDone }: { c: CandidateEditT; onDone: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [v, setV] = useState({
    age_min: c.preferences.age_min ?? '', age_max: c.preferences.age_max ?? '',
    districts: (c.preferences.districts ?? []).join(', '), open_to_relocation: !!c.preferences.open_to_relocation,
    notes: c.preferences.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      await api.updatePreferences(c.id, {
        age_min: v.age_min === '' ? null : Number(v.age_min), age_max: v.age_max === '' ? null : Number(v.age_max),
        districts: v.districts.split(',').map((s) => s.trim()).filter(Boolean), open_to_relocation: v.open_to_relocation, notes: v.notes,
      });
      await onDone(); setSaved(true);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <section className="stack-sm">
      <h2>{t('candidate.preferences')}</h2>
      <div className="card stack">
        <div className="grid-2">
          <Field label={t('candidate.ageMin')}>{(p) => <Input {...p} type="number" min={18} max={80} value={v.age_min} onChange={(e) => setV({ ...v, age_min: e.target.value })} />}</Field>
          <Field label={t('candidate.ageMax')}>{(p) => <Input {...p} type="number" min={18} max={80} value={v.age_max} onChange={(e) => setV({ ...v, age_max: e.target.value })} />}</Field>
        </div>
        <Field label={t('candidate.prefDistricts')} optional>{(p) => <Input {...p} value={v.districts} onChange={(e) => setV({ ...v, districts: e.target.value })} />}</Field>
        <Checkbox label={t('candidate.relocation')} checked={v.open_to_relocation} onChange={(e) => setV({ ...v, open_to_relocation: e.target.checked })} />
        <Field label={t('candidate.prefNotes')} optional>{(p) => <Textarea {...p} maxLength={500} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
        <ErrorNotice error={err} />
        <Button variant="secondary" onClick={() => void save()} loading={busy}>{saved ? t('common.saved') : t('common.save')}</Button>
      </div>
    </section>
  );
}

function ContactSection({ c, onDone }: { c: CandidateEditT; onDone: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ full_name: c.contact?.full_name ?? '', phone: c.contact?.phone ?? '', email: c.contact?.email ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      await api.updateContact(c.id, { full_name: v.full_name, phone: v.phone ? toE164(v.phone) : '', email: v.email });
      await onDone(); setSaved(true);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <section className="stack-sm">
      <h2>{t('candidate.contact')}</h2>
      <div className="card stack">
        <p className="info-row muted"><Icon name="lock" size={18} />{t('candidate.contactHint')}</p>
        <Field label={t('candidate.fullName')}>{(p) => <Input {...p} autoComplete="name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />}</Field>
        <Field label={t('candidate.phone')}>{(p) => <Input {...p} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
        <Field label={t('candidate.email')} optional>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
        <ErrorNotice error={err} />
        <Button variant="secondary" onClick={() => void save()} loading={busy}>{saved ? t('common.saved') : t('common.save')}</Button>
      </div>
    </section>
  );
}
