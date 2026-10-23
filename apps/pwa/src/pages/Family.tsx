import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, CardSkeleton, ErrorNotice, Field, Icon, Input, Select, Sheet, toE164, type Relation } from '@induru/shared';
import { api, qk } from '../lib/api';
import { PageHeader } from '../components/Page';
import { CandidateStatusBadge } from '../components/status';
import { InviteLink } from '../components/InviteLink';
import { inviteLink } from '../lib/invite';

/** M21 (family side) — members, profiles, shortlist, invitations. */
export default function Family() {
  const { t } = useTranslation();
  const m = useQuery({ queryKey: qk.membership, queryFn: api.myMembership });
  const c = useQuery({ queryKey: qk.familyCandidates, queryFn: api.familyCandidates });
  const [inviteOpen, setInviteOpen] = useState(false);

  if (m.isLoading) return <div className="page"><CardSkeleton /></div>;
  if (m.error) return <div className="page"><ErrorNotice error={m.error} /></div>;
  const fam = m.data!;

  return (
    <div className="page stack-lg">
      <PageHeader title={fam.family_name} kicker={<span className="num">{t('family.code', { code: fam.family_code })}</span>} />

      <section className="stack-sm">
        <div className="row-between" style={{ alignItems: 'baseline' }}>
          <h2>{t('family.profiles')}</h2>
          <Link to="/candidates/new" className="link">+ {t('home.add')}</Link>
        </div>
        <div className="card card-flush list">
          {(c.data ?? []).map((x) => (
            <Link key={x.id} to={`/candidates/${x.id}`} className="list-item" style={{ gap: 14 }}>
              <Avatar label={x.first_name} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{x.first_name}</div>
                <div className="xsmall muted">{t(`candidate.relationshipShort.${x.relationship}`)} · <span className="num">{x.code}</span></div>
              </div>
              <CandidateStatusBadge status={x.status} suspended={x.suspended} />
            </Link>
          ))}
          {c.data && !c.data.length ? <p className="muted small list-item">{t('home.noCandidates')}</p> : null}
        </div>
      </section>

      <section className="stack-sm">
        <div className="row-between" style={{ alignItems: 'baseline' }}>
          <h2>{t('family.members')}</h2>
          {fam.can_invite ? <button type="button" className="link" onClick={() => setInviteOpen(true)}>+ {t('family.invite')}</button> : null}
        </div>
        <div className="card card-flush list">
          {fam.members.map((mem) => (
            <div key={mem.user_id} className="list-item" style={{ gap: 14 }}>
              <Avatar label={mem.name ?? '?'} small />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{mem.name ?? '—'}{mem.is_me ? <span className="muted" style={{ fontWeight: 400 }}> ({t('family.you')})</span> : null}</div>
                <div className="xsmall muted">{t(`family.relations.${mem.relation}`)}</div>
              </div>
              {mem.is_primary ? <Badge tone="maroon">{t('family.primary')}</Badge> : null}
            </div>
          ))}
        </div>
      </section>

      <nav className="menu-list">
        {([
          ['/shortlist', 'bookmark', t('family.shortlist')],
          ['/notifications', 'bell', t('family.notifications')],
          ['/settings', 'settings', t('family.settings')],
          ['/help', 'lifeBuoy', t('family.help')],
        ] as const).map(([to, icon, label]) => (
          <Link key={to} to={to}><Icon name={icon} size={20} /><span className="grow">{label}</span><Icon name="chevronRight" size={18} style={{ color: 'var(--slate)' }} /></Link>
        ))}
      </nav>

      <InviteMemberSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function InviteMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<Relation>('MOTHER');
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const e164 = toE164(phone);
    if (!e164) return setPhoneErr(t('auth.invalidPhone'));
    setBusy(true); setErr(null); setPhoneErr(null);
    try {
      const r = await api.createFamilyInvitation(e164, relation);
      setLink(inviteLink(r.token));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const close = () => { setLink(null); setPhone(''); onClose(); };

  return (
    <Sheet open={open} onClose={close} title={t('family.inviteMember')}>
      {link ? <InviteLink link={link} shareText={t('candidate.inviteShareText', { link })} note={t('candidate.inviteReady', { name: '' })} /> : (
        <>
          <p className="muted small">{t('family.inviteMemberBody')}</p>
          <Field label={t('family.memberRelation')}>
            {(p) => (
              <Select {...p} value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
                {(['FATHER', 'MOTHER', 'GUARDIAN', 'SIBLING', 'RELATIVE'] as const).map((r) => <option key={r} value={r}>{t(`family.relations.${r}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t('family.memberPhone')} error={phoneErr ?? undefined}>
            {(p) => <Input {...p} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <ErrorNotice error={err} />
          <Button block onClick={() => void create()} loading={busy}>{t('candidate.inviteCreate')}</Button>
        </>
      )}
    </Sheet>
  );
}
