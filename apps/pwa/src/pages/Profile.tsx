import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardSkeleton, ErrorNotice, Field, Icon, Notice, Select, Sheet, Textarea, TrustBadges, isApiError } from '@induru/shared';
import { api, qk } from '../lib/api';
import { signedPhotoUrl } from '../lib/storage';
import { PageHeader, TopBar } from '../components/Page';
import { PendingBond } from '../components/Ornament';

/** M13 — editorial heading, matted photo plate, justified self-intro. Each badge names one check and appears
 *  only with evidence. Report is always one tap away. Includes M14 shortlist and M15 send interest. */
export default function Profile() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.profile(code), queryFn: () => api.profile(code), retry: false });
  const photo = useQuery({
    queryKey: ['photo', code],
    enabled: !!q.data?.has_photo,
    queryFn: async () => {
      const path = await api.photoPath(code);
      return path ? signedPhotoUrl(path) : null;
    },
    staleTime: 60_000,
  });
  const [note, setNote] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (q.isLoading) return <div className="page"><CardSkeleton count={2} /></div>;
  if (q.error) {
    return (
      <div className="page stack">
        <PageHeader title={code} back />
        {isApiError(q.error, 'PROFILE_PRIVATE') ? <p className="info-row muted"><Icon name="lock" size={18} />{t('profile.notAvailable')}</p> : <ErrorNotice error={q.error} />}
      </div>
    );
  }
  const p = q.data!;
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: qk.profile(code) }),
    qc.invalidateQueries({ queryKey: qk.shortlist }),
    qc.invalidateQueries({ queryKey: ['discover'] }),
  ]);

  const toggleShortlist = async () => {
    setErr(null);
    try {
      if (p.shortlisted) await api.removeShortlist(code);
      else await api.saveShortlist(code);
      await refresh();
    } catch (e) { setErr(e); }
  };
  const saveNote = async () => {
    setSavingNote(true);
    try { await api.saveShortlist(code, note ?? ''); await refresh(); setNote(null); } catch (e) { setErr(e); } finally { setSavingNote(false); }
  };
  const block = async () => {
    try { await api.block(code); await refresh(); navigate('/discover', { replace: true }); } catch (e) { setErr(e); setBlockOpen(false); }
  };

  const matched = p.open_match?.status === 'MUTUALLY_ACCEPTED';
  const place = [...new Set([p.city, p.district, p.state].filter(Boolean))].join(', ');
  const openTo = [p.preferences?.districts?.join(', '), p.preferences?.open_to_relocation ? t('profile.relocationPossible') : null].filter(Boolean).join(', ');
  const customLabel = (k: string) => (k === 'gotram' ? t('candidate.gotram') : k === 'star' ? t('candidate.star') : k === 'raasi' ? t('candidate.raasi') : k);

  return (
    <div className="screen">
      <TopBar right={
        <>
          <Link to={`/help?code=${p.code}`} className="icon-btn" aria-label={t('profile.report')}><Icon name="flag" size={20} /></Link>
          <button type="button" className="icon-btn" style={{ color: p.shortlisted ? 'var(--maroon)' : undefined }} onClick={() => void toggleShortlist()}
            aria-pressed={!!p.shortlisted} aria-label={p.shortlisted ? t('profile.shortlisted') : t('profile.shortlist')}>
            <Icon name={p.shortlisted ? 'bookmarkCheck' : 'bookmark'} size={21} />
          </button>
        </>
      } />
      <div className="page stack" style={{ paddingTop: 0, gap: 18 }}>
        <div className="row" style={{ gap: 16 }}>
          <div className="plate">{photo.data ? <img src={photo.data} alt="" /> : <Icon name="lock" size={20} />}</div>
          <div>
            <div className="code">{p.code}</div>
            <h1 className="display" style={{ fontSize: 34, margin: '4px 0 6px' }}>{[p.age, p.city ?? p.district].filter(Boolean).join(', ')}</h1>
            <div className="small body2">{[p.profession, p.education].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <TrustBadges checks={p.checks} />
        <ErrorNotice error={err} />

        {p.bio ? (
          <div className="rule-top" style={{ paddingTop: 14 }}>
            <div className="kicker kicker-gold" style={{ marginBottom: 6 }}>{t('profile.inTheirWords')}</div>
            <p style={{ lineHeight: 1.6, textAlign: 'justify', hyphens: 'auto', whiteSpace: 'pre-line' }}>{p.bio}</p>
          </div>
        ) : null}

        <dl className="kv rule-top" style={{ paddingTop: 14 }}>
          <dt>{t('candidate.education')}</dt><dd>{p.education ?? t('common.notProvided')}</dd>
          <dt>{t('profile.work')}</dt><dd>{p.profession ?? t('common.notProvided')}</dd>
          <dt>{t('candidate.maritalStatus')}</dt><dd>{p.marital_status ? t(`candidate.marital.${p.marital_status}`) : '—'}</dd>
          {p.height_cm ? <><dt>{t('candidate.height')}</dt><dd className="num">{p.height_cm}</dd></> : null}
          {place ? <><dt>{t('profile.location')}</dt><dd>{place}</dd></> : null}
          {p.family_summary ? <><dt>{t('profile.family')}</dt><dd style={{ whiteSpace: 'pre-line' }}>{p.family_summary}</dd></> : null}
          {p.preferences?.age_min ? <><dt>{t('profile.preferences')}</dt><dd>{t('profile.ageRangePref', { min: p.preferences.age_min, max: p.preferences.age_max ?? '—' })}</dd></> : null}
          {openTo ? <><dt>{t('profile.openTo')}</dt><dd>{openTo}</dd></> : null}
          {Object.entries(p.customs ?? {}).map(([k, v]) => <span key={k} style={{ display: 'contents' }}><dt>{customLabel(k)}</dt><dd>{v}</dd></span>)}
        </dl>

        {p.shortlisted ? (
          <div className="rule-top stack-sm" style={{ paddingTop: 14 }}>
            <Field label={t('profile.note')} hint={t('profile.notePlaceholder')}>
              {(fp) => <Textarea {...fp} maxLength={500} value={note ?? p.shortlist_note ?? ''} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 80 }} />}
            </Field>
            {note != null ? <Button small variant="secondary" onClick={() => void saveNote()} loading={savingNote}>{t('common.save')}</Button> : null}
          </div>
        ) : null}

        <button type="button" className="link link-muted" style={{ alignSelf: 'flex-start', display: 'flex', gap: 6, alignItems: 'center' }} onClick={() => setBlockOpen(true)}>
          <Icon name="eyeOff" size={16} />{t('profile.block')}
        </button>

        <div className="sticky-foot" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <Button variant="secondary" onClick={() => void toggleShortlist()} style={{ fontSize: 18, minHeight: 52 }}>
            <Icon name={p.shortlisted ? 'bookmarkCheck' : 'bookmark'} size={17} />{p.shortlisted ? t('profile.shortlisted') : t('profile.shortlist')}
          </Button>
          {p.open_match ? (
            <Link to={matched ? '/introductions' : '/interests?box=SENT'} className="btn btn-secondary" style={{ fontSize: 18, minHeight: 52 }}>
              {matched ? t('profile.matched') : t('profile.interestSent')}
            </Link>
          ) : (
            <Button onClick={() => setInterestOpen(true)} style={{ fontSize: 18, minHeight: 52 }}>{t('profile.sendInterest')}</Button>
          )}
        </div>
      </div>

      <InterestSheet open={interestOpen} onClose={() => setInterestOpen(false)} targetCode={p.code} onSent={() => void refresh()} />
      <Sheet open={blockOpen} onClose={() => setBlockOpen(false)} title={t('profile.block')}>
        <p className="muted">{t('profile.blockConfirm')}</p>
        <Button block variant="danger" onClick={() => void block()}>{t('profile.block')}</Button>
      </Sheet>
    </div>
  );
}

const MESSAGE_MAX = 200;

/** M15 — bottom sheet; gold bond line dashed because the bond is not yet mutual; three numbered steps make
 *  the consent gate explicit. */
function InterestSheet({ open, onClose, targetCode, onSent }: { open: boolean; onClose: () => void; targetCode: string; onSent: () => void }) {
  const { t } = useTranslation();
  const cands = useQuery({ queryKey: qk.familyCandidates, queryFn: api.familyCandidates, enabled: open });
  const eligible = (cands.data ?? []).filter((c) => c.discoverable && c.my_capabilities.includes('SUGGEST_INTEREST'));
  const [source, setSource] = useState<string>('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const chosen = eligible.find((c) => c.id === (source || eligible[0]?.id));
  const name = chosen?.first_name ?? '';

  const send = async () => {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.sendInterest(chosen.id, targetCode, message.trim());
      setDone(r.duplicate ? t('interest.duplicate') : chosen.is_owner ? t('interest.sent') : t('interest.sentNeedsConfirm', { name }));
      onSent();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const close = () => { setDone(null); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="">
      <div className="bond"><PendingBond /></div>
      {done ? (
        <div className="stack">
          <h2 className="center" style={{ fontSize: 26 }}>{done}</h2>
          <Button block onClick={close}>{t('common.done')}</Button>
        </div>
      ) : cands.isLoading ? <CardSkeleton count={1} /> : !eligible.length ? (
        <Notice tone="info">{t('interest.noEligible')}</Notice>
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="center">
            <h2 style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 8 }}>{t('interest.heading', { code: targetCode, name })}</h2>
            <p className="small muted">{chosen?.is_owner ? t('interest.selfLead') : t('interest.familyLead', { name })}</p>
          </div>
          {eligible.length > 1 ? (
            <Field label={t('interest.from')}>
              {(p) => (
                <Select {...p} value={chosen?.id} onChange={(e) => setSource(e.target.value)}>
                  {eligible.map((c) => <option key={c.id} value={c.id}>{c.first_name} ({c.code})</option>)}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label={t('interest.messageLabel')} optional hint={<span className="num" style={{ display: 'block', textAlign: 'right', fontSize: 12 }}>{message.length} / {MESSAGE_MAX}</span>}>
            {(p) => <Textarea {...p} maxLength={MESSAGE_MAX} placeholder={t('interest.messagePlaceholder')} value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 84 }} />}
          </Field>
          <div className="stack-sm rule-top" style={{ gap: 10 }}>
            {(chosen?.is_owner ? [t('interest.stepOtherDecides', { code: targetCode }), t('interest.stepBoth')]
              : [t('interest.stepConfirm', { name }), t('interest.stepOtherDecides', { code: targetCode }), t('interest.stepBoth')]).map((s, i) => (
              <div key={i} className="row small" style={{ alignItems: 'flex-start' }}><span className="num-circle">{i + 1}</span>{s}</div>
            ))}
          </div>
          <ErrorNotice error={err} />
          <Button block onClick={() => void send()} loading={busy}>{chosen?.is_owner ? t('interest.send') : t('interest.askConfirm', { name })}</Button>
        </div>
      )}
    </Sheet>
  );
}
