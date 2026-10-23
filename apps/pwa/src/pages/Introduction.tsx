import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, CardSkeleton, EmptyState, ErrorNotice, Field, Icon, Input, Notice, OptionRow, Sheet, Timeline,
  fmtDate, fmtDateTime, maskPhone, type ContactField, type IconName, type IntroductionDetail, type Locale, type Meeting, type MeetingFormat,
  type SharedContact, type TimelineState } from '@induru/shared';
import { api, qk } from '../lib/api';
import { useStepUp } from '../app/stepUp';
import { PageHeader, TopBar } from '../components/Page';
import { KnotRing, LeafArch } from '../components/Ornament';

const STAGES = ['PENDING_CONTACT', 'INTRODUCED', 'DISCUSSING', 'MEETING_PLANNED'] as const;

/** M17 — the knot-and-petal ring appears only here, after mutual acceptance. Timeline follows
 *  PENDING_CONTACT → INTRODUCED → DISCUSSING → MEETING_PLANNED. Includes M18 contact sharing and M19 meetings. */
export default function Introduction() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.introduction(id), queryFn: () => api.introduction(id) });
  const [err, setErr] = useState<unknown>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState<{ replaces?: string } | null>(null);
  const [confirm, setConfirm] = useState<'match' | 'close' | null>(null);
  const locale = i18n.language as Locale;

  if (q.isLoading) return <div className="page"><CardSkeleton count={3} /></div>;
  if (q.error) return <div className="page"><PageHeader title={t('intro.title')} back /><ErrorNotice error={q.error} /></div>;
  const intro = q.data!;
  const live = !['CLOSED', 'MATCH_CONFIRMED'].includes(intro.stage);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.introduction(id) }), qc.invalidateQueries({ queryKey: qk.introductions })]);
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await refresh(); setConfirm(null); } catch (e) { setErr(e); setConfirm(null); }
  };

  const at = STAGES.indexOf(intro.stage as (typeof STAGES)[number]);
  const stateOf = (i: number): TimelineState => (!live || at > i ? 'done' : at === i ? 'current' : 'future');
  const iShared = intro.my_grants.length > 0;
  const theyShared = intro.shared_with_me.length > 0;
  const contactSub = iShared && theyShared ? t('intro.bothShared') : iShared ? t('intro.youSharedWaiting', { code: intro.other.code })
    : theyShared ? t('intro.theyShared', { code: intro.other.code, name: intro.my_candidate.first_name }) : t('intro.noneShared');
  const steps = [
    { state: 'done' as TimelineState, title: t('intro.stepMutual'), sub: t('intro.stepMutualSub') },
    { state: stateOf(0), title: t('intro.stepContact'), sub: contactSub,
      children: intro.stage === 'PENDING_CONTACT' && intro.is_candidate && !iShared ? (
        <Button small onClick={() => setShareOpen(true)} style={{ marginTop: 10 }}><Icon name="lockOpen" size={16} />{t('intro.shareContact')}</Button>
      ) : null },
    { state: stateOf(1) === 'done' && at < 2 ? 'current' : stateOf(1), title: t('intro.stepTalk'),
      children: live && intro.stage === 'INTRODUCED' && (intro.is_candidate || intro.can_coordinate) ? (
        <Button small variant="secondary" onClick={() => void run(() => api.markDiscussing(id))} style={{ marginTop: 10 }}>{t('intro.markDiscussing')}</Button>
      ) : null },
    { state: stateOf(3), title: t('intro.stepMeeting') },
    ...(intro.stage === 'MATCH_CONFIRMED' ? [{ state: 'done' as TimelineState, title: t('intro.stage.MATCH_CONFIRMED') }]
      : intro.stage === 'CLOSED' ? [{ state: 'future' as TimelineState, title: t('intro.stage.CLOSED') }] : []),
  ];
  // Families talk is "current" once introduced, until a meeting is planned.
  if (at === 1 || at === 2) { steps[2].state = 'current'; steps[1].state = 'done'; }

  return (
    <div className="screen">
      <TopBar right={
        <Link to={`/help?intro=${id}`} className="icon-btn" aria-label={t('profile.report')}><Icon name="flag" size={20} /></Link>
      } />
      <div className="page stack" style={{ paddingTop: 0, gap: 22 }}>
        <div className="stack-sm center" style={{ alignItems: 'center', gap: 10 }}>
          <KnotRing />
          <div className={`kicker ${intro.stage === 'CLOSED' ? '' : 'kicker-teal'}`}>{intro.stage === 'MATCH_CONFIRMED' ? t('intro.stage.MATCH_CONFIRMED') : intro.stage === 'CLOSED' ? t('intro.stage.CLOSED') : t('intro.event.MUTUALLY_ACCEPTED')}</div>
          <h1 className="display" style={{ fontSize: 32 }}>{intro.my_candidate.first_name} &amp; <span className="num">{intro.other.code}</span></h1>
          <div className="xsmall muted">
            {t('intro.openedOn', { date: fmtDate(intro.opened_at, locale) })} · {intro.broker?.name ? t('intro.broker', { name: intro.broker.name }) : t('intro.noBroker')}
          </div>
          {!intro.other.unavailable ? <Link to={`/p/${intro.other.code}`} className="link">{t('intro.viewProfile')}</Link> : null}
        </div>

        <Timeline items={steps} />
        <ErrorNotice error={err} />

        <ContactsSection intro={intro} onShare={() => setShareOpen(true)} onChanged={refresh} />
        <MeetingsSection intro={intro} onPropose={(replaces) => setMeetingOpen({ replaces })} run={run} />

        {live && intro.is_candidate ? (
          <section className="stack-sm">
            {intro.stage !== 'PENDING_CONTACT' ? (
              intro.my_confirmed ? <Notice tone="success">{t('intro.youConfirmed')}</Notice> : (
                <Button variant="teal" block onClick={() => setConfirm('match')}><Icon name="check" size={18} />{t('intro.confirmMatch')}</Button>
              )
            ) : null}
          </section>
        ) : null}

        <details className="rule-top" style={{ paddingTop: 14 }}>
          <summary className="kicker" style={{ cursor: 'pointer' }}>{t('intro.timeline')}</summary>
          <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {intro.timeline.map((e, i) => (
              <li key={i} className="row-between small">
                <span>{t(`intro.event.${e.kind}` as 'intro.event.CLOSED', { defaultValue: e.kind })}</span>
                <span className="xsmall muted">{[t(`intro.by.${e.by}`), fmtDateTime(e.at, locale)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="foot-actions">
          <Link to={`/help?intro=${id}`} style={{ color: 'var(--maroon)' }}><Icon name="lifeBuoy" size={16} />{t('intro.getHelp')}</Link>
          {live && intro.is_candidate ? (
            <button type="button" style={{ color: 'var(--rose)' }} onClick={() => setConfirm('close')}><Icon name="x" size={16} />{t('intro.close')}</button>
          ) : <Link to={`/help?intro=${id}`} style={{ color: 'var(--rose)' }}><Icon name="flag" size={16} />{t('profile.report')}</Link>}
        </div>
      </div>

      <ShareSheet intro={intro} open={shareOpen} onClose={() => setShareOpen(false)} onDone={refresh} />
      <MeetingSheet intro={intro} state={meetingOpen} onClose={() => setMeetingOpen(null)} onDone={refresh} />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'match' ? t('intro.confirmMatch') : t('intro.close')}>
        <p className="muted">{confirm === 'match' ? t('intro.confirmMatchBody') : t('intro.closeConfirm')}</p>
        <Button block variant={confirm === 'match' ? 'teal' : 'danger'}
          onClick={() => void run(() => (confirm === 'match' ? api.confirmMatch(id) : api.closeIntroduction(id)))}>
          {confirm === 'match' ? t('intro.confirmMatch') : t('intro.close')}
        </Button>
      </Sheet>
    </div>
  );
}

function ContactsSection({ intro, onShare, onChanged }: { intro: IntroductionDetail; onShare: () => void; onChanged: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation();
  const [shown, setShown] = useState<SharedContact[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const live = !['CLOSED', 'MATCH_CONFIRMED'].includes(intro.stage);
  const locale = i18n.language as Locale;

  const reveal = async () => {
    setBusy(true); setErr(null);
    try { setShown(await api.contacts(intro.id)); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const stop = async (grantId: string) => {
    setErr(null);
    try { await api.revokeGrant(grantId); await onChanged(); } catch (e) { setErr(e); }
  };

  return (
    <section className="stack-sm">
      <h2>{t('intro.contactsTitle')}</h2>
      <div className="card stack">
        <div className="stack-sm">
          <h3>{t('intro.sharedWithYou')}</h3>
          {!intro.shared_with_me.length ? <p className="muted small">{t('intro.nothingShared')}</p> : shown ? (
            shown.map((c) => (
              <div key={c.grant_id} className="stack-sm" style={{ gap: 4 }}>
                {c.full_name ? <p className="contact-value">{c.full_name}</p> : null}
                {c.phone ? <a className="contact-value row" style={{ gap: 6 }} href={`tel:${c.phone}`}><Icon name="phone" size={16} />{c.phone}</a> : null}
                {c.email ? <a className="contact-value row" style={{ gap: 6 }} href={`mailto:${c.email}`}><Icon name="mail" size={16} />{c.email}</a> : null}
                <p className="xsmall muted">{t('common.expiresOn', { date: fmtDate(c.expires_at, locale) })}</p>
              </div>
            ))
          ) : (
            <>
              <div className="row wrap" style={{ gap: 6 }}>
                {[...new Set(intro.shared_with_me.flatMap((g) => g.fields))].map((f) => <Badge key={f} tone="teal" icon="check">{t(`intro.field.${f}`)}</Badge>)}
              </div>
              {live ? <Button variant="secondary" small onClick={() => void reveal()} loading={busy}><Icon name="eye" size={16} />{t('intro.showContacts')}</Button> : null}
              <p className="xsmall muted">{t('intro.contactsAudited')}</p>
            </>
          )}
        </div>
        {intro.is_candidate ? (
          <>
            <hr className="divider" />
            <div className="stack-sm">
              <h3>{t('intro.yourSharing')}</h3>
              {intro.my_grants.map((g) => (
                <div key={g.id} className="row-between">
                  <div className="stack-sm" style={{ gap: 2 }}>
                    <span className="small" style={{ fontWeight: 600 }}>{t(`intro.recipientLabel.${g.recipient_label}` as 'intro.recipientLabel.MEMBER')}</span>
                    <span className="xsmall muted">{g.fields.map((f) => t(`intro.field.${f}`)).join(', ')} · {t('common.expiresOn', { date: fmtDate(g.expires_at, locale) })}</span>
                  </div>
                  {live ? <Button variant="ghost" small onClick={() => void stop(g.id)}>{t('intro.stopSharing')}</Button> : null}
                </div>
              ))}
              {live && (intro.my_grants.length || intro.stage !== 'PENDING_CONTACT') ? <Button small variant="secondary" onClick={onShare}><Icon name="smartphone" size={17} />{t('intro.shareContact')}</Button> : null}
            </div>
          </>
        ) : <p className="xsmall muted">{t('intro.onlyCandidateShares')}</p>}
        <ErrorNotice error={err} />
      </div>
    </section>
  );
}

function MeetingsSection({ intro, onPropose, run }: { intro: IntroductionDetail; onPropose: (replaces?: string) => void; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const canPlan = intro.can_coordinate && ['INTRODUCED', 'DISCUSSING', 'MEETING_PLANNED'].includes(intro.stage);
  const tone = (m: Meeting) => (m.status === 'ACCEPTED' ? 'teal' : m.status === 'PROPOSED' ? 'amber' : 'slate');
  return (
    <section className="stack-sm">
      <h2>{t('intro.meetings')}</h2>
      <div className="card stack">
        {!intro.meetings.length ? <EmptyState illustration="meetingScheduled" title={t('intro.noMeetings')} /> : intro.meetings.map((m) => (
          <div key={m.id} className="stack-sm">
            <div className="row-between">
              <span style={{ fontWeight: 600 }} className="row"><Icon name="calendar" size={16} />{fmtDateTime(m.start_at, i18n.language as Locale, m.timezone)}</span>
              <Badge tone={tone(m)}>{t(`intro.meetingStatus.${m.status}`)}</Badge>
            </div>
            <p className="small muted">{t(`intro.format.${m.format}`)}{m.location_hint ? ` · ${m.location_hint}` : ''}</p>
            {m.status === 'PROPOSED' && !m.proposed_by_me && intro.can_coordinate ? (
              <div className="row wrap">
                <Button small variant="secondary" onClick={() => void run(() => api.respondMeeting(m.id, 'DECLINE'))}>{t('intro.decline')}</Button>
                <Button small variant="secondary" onClick={() => onPropose(m.id)}>{t('intro.reschedule')}</Button>
                <Button small onClick={() => void run(() => api.respondMeeting(m.id, 'ACCEPT'))}>{t('intro.accept')}</Button>
              </div>
            ) : null}
            {m.status === 'ACCEPTED' && canPlan ? <Button small variant="ghost" onClick={() => onPropose(m.id)}>{t('intro.reschedule')}</Button> : null}
          </div>
        ))}
        {canPlan ? <Button small variant="secondary" onClick={() => onPropose()}><Icon name="calendar" size={17} />{t('intro.proposeMeeting')}</Button> : null}
      </div>
    </section>
  );
}

const SHARE_DAYS = [14, 30, 90];
const FIELD_ICON: Record<ContactField, IconName> = { PHONE: 'smartphone', EMAIL: 'mail', FULL_NAME: 'user', PHOTO: 'image' };

/** M18 — explicit who / what / how long. CTA restates exactly what is being shared. One grant per
 *  recipient per introduction, audited; requires a fresh sign-in. */
function ShareSheet({ intro, open, onClose, onDone }: { intro: IntroductionDetail; open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const withStepUp = useStepUp();
  const recipients = intro.possible_recipients ?? [];
  const own = useQuery({ queryKey: qk.candidate(intro.my_candidate.id), queryFn: () => api.candidate(intro.my_candidate.id), enabled: open && intro.is_candidate });
  const contact = own.data?.contact;
  const [who, setWho] = useState<string[] | null>(null);
  const [fields, setFields] = useState<ContactField[]>(['PHONE']);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const chosen = who ?? recipients.filter((r) => r.relation === 'CANDIDATE').map((r) => r.user_id);
  const label = (relation: string) => (relation === 'CANDIDATE' ? t('intro.recipientCandidate', { code: intro.other.code }) : t(`intro.recipientLabel.${relation}` as 'intro.recipientLabel.MEMBER'));
  const preview: Partial<Record<ContactField, string | null | undefined>> = {
    PHONE: contact?.phone ? maskPhone(contact.phone) : undefined,
    EMAIL: contact?.email ? contact.email.replace(/^(.).*(@.*)$/, '$1•••$2') : undefined,
    FULL_NAME: contact?.full_name,
  };
  const whatText = fields.map((f) => t(`intro.field.${f}`).toLowerCase()).join(', ');
  const whoText = chosen.length === 1 ? label(recipients.find((r) => r.user_id === chosen[0])?.relation ?? 'MEMBER') : t('intro.nPeople', { count: chosen.length });

  const share = async () => {
    if (!chosen.length || !fields.length) return;
    setBusy(true); setErr(null);
    try {
      await withStepUp(async () => { for (const r of chosen) await api.grantContact(intro.id, r, fields, days); });
      await onDone();
      onClose();
    } catch (e) { if (!(e instanceof Error && e.message === 'cancelled')) setErr(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="">
      <div style={{ marginTop: -8 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '1.5px solid var(--gold)', display: 'grid', placeItems: 'center', color: 'var(--maroon)', marginBottom: 12 }}><Icon name="smartphone" size={22} /></div>
        <h2 style={{ fontSize: 28, marginBottom: 6 }}>{t('intro.shareTitle')}</h2>
        <p className="small muted">{t('intro.shareFor', { name: intro.my_candidate.first_name })}</p>
      </div>
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>{t('intro.who')}</div>
        <div className="opt-list">
          {recipients.map((r) => (
            <OptionRow key={r.user_id} type="checkbox" title={label(r.relation)} checked={chosen.includes(r.user_id)}
              onChange={(e) => setWho(e.target.checked ? [...chosen, r.user_id] : chosen.filter((x) => x !== r.user_id))} />
          ))}
        </div>
      </div>
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>{t('intro.what')}</div>
        <div className="opt-list">
          {(['PHONE', 'EMAIL', 'FULL_NAME', 'PHOTO'] as ContactField[]).map((f) => (
            <OptionRow key={f} type="checkbox" title={<span className="row" style={{ gap: 8 }}><Icon name={FIELD_ICON[f]} size={16} style={{ color: 'var(--slate)' }} />{t(`intro.field.${f}`)}</span>}
              right={preview[f] ? <span className="small muted num">{preview[f]}</span> : null}
              checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} />
          ))}
        </div>
      </div>
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>{t('intro.howLong')}</div>
        <div className="segmented" role="group">
          {SHARE_DAYS.map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{t('intro.days', { count: d })}</button>)}
        </div>
      </div>
      <Notice tone="info" icon="alert">{t('intro.shareWarning')}</Notice>
      <ErrorNotice error={err} />
      <Button block onClick={() => void share()} loading={busy} disabled={!fields.length || !chosen.length}>
        {fields.length && chosen.length ? t('intro.shareCta', { what: whatText, who: whoText }) : t('intro.share')}
      </Button>
    </Sheet>
  );
}

const FORMAT_ICON: Record<MeetingFormat, IconName> = { IN_PERSON: 'coffee', PHONE_CALL: 'phone', VIDEO_EXTERNAL: 'smartphone' };
const SLOTS = [{ key: 'morning', h: 10 }, { key: 'afternoon', h: 15 }, { key: 'evening', h: 18 }] as const;

/** Next four weekend days — a gentle default for family meetings. */
function weekendDays(): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < 4) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) out.push(new Date(d));
  }
  return out;
}

/** M19 — a small leaf arch sits by the title, away from controls. Broad area only, never a home address.
 *  Time zone shown. */
function MeetingSheet({ intro, state, onClose, onDone }: { intro: IntroductionDetail; state: { replaces?: string } | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation();
  const [days] = useState(weekendDays);
  const [day, setDay] = useState<number>(0);
  const [slot, setSlot] = useState<(typeof SLOTS)[number]['key']>('morning');
  const [custom, setCustom] = useState('');
  const [format, setFormat] = useState<MeetingFormat>('IN_PERSON');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  // One key per open sheet so a double-tap or network retry never creates two meetings.
  const [key] = useState(() => crypto.randomUUID());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const locale = i18n.language === 'te' ? 'te-IN' : 'en-IN';

  const startAt = () => {
    if (custom) return new Date(custom);
    const d = new Date(days[day]);
    d.setHours(SLOTS.find((s) => s.key === slot)!.h, 0, 0, 0);
    return d;
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.proposeMeeting({ intro: intro.id, startAt: startAt().toISOString(), timezone, format, locationHint: where, key: `${key}-${state?.replaces ?? 'new'}`, replaces: state?.replaces });
      await onDone();
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!state} onClose={onClose} title="">
      <div style={{ position: 'relative', marginTop: -8 }}>
        <LeafArch />
        <h2 style={{ fontSize: 28, marginBottom: 6 }}>{state?.replaces ? t('intro.reschedule') : t('intro.proposeMeeting')}</h2>
        <p className="small muted">{t('intro.bothRespond')}</p>
      </div>
      <div className="field">
        <span className="label">{t('intro.meetingFormat')}</span>
        <div className="tiles-3" role="group">
          {(['IN_PERSON', 'PHONE_CALL', 'VIDEO_EXTERNAL'] as const).map((f) => (
            <button key={f} type="button" className="choice-tile" aria-pressed={format === f} onClick={() => setFormat(f)}>
              <Icon name={FORMAT_ICON[f]} size={20} />{t(`intro.formatShort.${f}`)}
            </button>
          ))}
        </div>
      </div>
      <Field label={t('intro.meetingWhere')} hint={t('intro.meetingWhereHint')}>
        {(p) => (
          <div className="input-prefix"><span style={{ borderRight: 0, paddingRight: 0, color: 'var(--slate)' }}><Icon name="mapPin" size={18} /></span>
            <Input {...p} maxLength={120} placeholder={t('intro.meetingWherePlaceholder')} value={where} onChange={(e) => setWhere(e.target.value)} />
          </div>
        )}
      </Field>
      <div className="field">
        <span className="label">{t('intro.meetingWhen')}</span>
        <div className="date-picks" role="group">
          {days.map((d, i) => (
            <button key={i} type="button" className="date-pick" aria-pressed={!custom && day === i} onClick={() => { setDay(i); setCustom(''); }}>
              <div className="dow">{d.toLocaleDateString(locale, { weekday: 'short' })}</div>
              <div className="d">{d.getDate()}</div>
            </button>
          ))}
        </div>
        <div className="segmented" role="group" style={{ marginTop: 8 }}>
          {SLOTS.map((s) => <button key={s.key} type="button" aria-pressed={!custom && slot === s.key} onClick={() => { setSlot(s.key); setCustom(''); }}>{t(`intro.slot.${s.key}`)}</button>)}
        </div>
        <p className="hint">{days[day].toLocaleDateString(locale, { month: 'short', year: 'numeric' })} · {timezone === 'Asia/Kolkata' ? 'IST' : timezone}</p>
      </div>
      <Field label={t('intro.otherTime')} optional>
        {(p) => <Input {...p} type="datetime-local" value={custom} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setCustom(e.target.value)} />}
      </Field>
      <ErrorNotice error={err} />
      <Button block onClick={() => void submit()} loading={busy}>{t('intro.sendProposal')}</Button>
    </Sheet>
  );
}
