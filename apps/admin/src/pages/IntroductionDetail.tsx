import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Notice, Select, Textarea } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, S, dt, useAction } from '../ui';

/** A07 — decisions, broker assignment, stages, meeting planning, closure, scoped notes. */
export default function IntroductionDetail({ me }: { me: string }) {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['introduction', id], queryFn: () => adminApi.introduction(id) });
  return <Loadable q={q}>{(data) => <Detail data={data} id={id} me={me} />}</Loadable>;
}

function Detail({ data, id, me }: { data: Row; id: string; me: string }) {
  const i = data.introduction;
  const a = useAction();
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('BROKERS');
  const [stage, setStage] = useState('DISCUSSING');
  const [reason, setReason] = useState('');
  const [when, setWhen] = useState('');
  const [format, setFormat] = useState('IN_PERSON');
  const [hint, setHint] = useState('');
  const inv = ['introduction', 'introductions', 'overview'];
  const live = !['CLOSED', 'MATCH_CONFIRMED'].includes(i.stage);

  return (
    <>
      <PageTitle title={<><span className="mono">{data.source.code}</span> ↔ <span className="mono">{data.target.code}</span></>}
        sub={<>Via {data.match.via} · opened {dt(i.opened_at)}</>} action={<S v={i.stage} />} />
      <div className="cols">
        <div className="stack">
          <section className="card stack-sm">
            <h2>Sides</h2>
            {(['source', 'target'] as const).map((s) => (
              <p key={s} className="small"><strong>{s === 'source' ? 'Source' : 'Target'}:</strong> <span className="mono">{data[s].code}</span> · {data[s].unavailable ? 'unavailable' : `${data[s].age} · ${data[s].profession ?? '—'} · ${data[s].district ?? ''}`}</p>
            ))}
            {data.match.rationale ? <p className="small muted">Broker rationale: {data.match.rationale}</p> : null}
          </section>
          <section className="card stack-sm">
            <h2>Candidate decisions</h2>
            {data.decisions.map((x: Row, k: number) => (
              <p key={k} className="small">{x.side}: <S v={x.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'} /> · {dt(x.at)} · {x.by_candidate ? 'by candidate' : <S v="NOT_BY_CANDIDATE" />}</p>
            ))}
          </section>
          <section className="card stack-sm">
            <h2>Contact grants (metadata only)</h2>
            {data.grants.length ? data.grants.map((g: Row, k: number) => (
              <p key={k} className="small">{g.side} shared {g.fields.join(', ')} · {dt(g.granted_at)} {g.revoked_at ? <S v="REVOKED" /> : <>· expires {dt(g.expires_at)}</>}</p>
            )) : <p className="muted small">Nothing shared yet. Contact details are never visible to staff here.</p>}
          </section>
          <section className="card stack-sm">
            <h2>Meetings</h2>
            {data.meetings.length ? data.meetings.map((m: Row) => (
              <p key={m.id} className="small">{dt(m.start_at)} · {m.format} · {m.location_hint ?? '—'} · <S v={m.status} /></p>
            )) : <p className="muted small">None.</p>}
          </section>
          <section className="card stack-sm">
            <h2>Timeline</h2>
            {data.timeline.map((e: Row) => <p key={e.id} className="small">{dt(e.at)} · {e.kind} · {e.actor_side}</p>)}
          </section>
        </div>

        <div className="stack">
          <section className="card stack-sm">
            <h2>Broker</h2>
            {i.assigned_broker_id === me ? <Notice tone="success">Assigned to you</Notice>
              : <Button onClick={() => void a.run('assign', () => adminApi.assignBroker(id, me), inv)} loading={a.busy === 'assign'}>Assign to me</Button>}
          </section>

          {data.can_manage && live ? (
            <>
              <section className="card stack-sm">
                <h2>Stage</h2>
                <Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="DISCUSSING">Discussing</option><option value="MEETING_PLANNED">Meeting planned</option><option value="CLOSED">Close</option>
                </Select>
                {stage === 'CLOSED' ? <Field label="Closure reason (internal)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field> : null}
                <Button variant="secondary" loading={a.busy === 'stage'} onClick={() => void a.run('stage', () => adminApi.setStage(id, stage, reason), inv)}>Update stage</Button>
                <p className="xsmall muted">Stages that depend on candidate consent (introduced, match confirmed) cannot be set by staff.</p>
              </section>
              {['INTRODUCED', 'DISCUSSING', 'MEETING_PLANNED'].includes(i.stage) ? (
                <section className="card stack-sm">
                  <h2>Propose meeting</h2>
                  <Field label="When (IST)">{(p) => <Input {...p} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
                  <Field label="Format">{(p) => (
                    <Select {...p} value={format} onChange={(e) => setFormat(e.target.value)}>
                      <option value="IN_PERSON">In person</option><option value="PHONE_CALL">Phone call</option><option value="VIDEO_EXTERNAL">Video (external)</option>
                    </Select>)}</Field>
                  <Field label="General area (no home address)">{(p) => <Input {...p} maxLength={120} value={hint} onChange={(e) => setHint(e.target.value)} />}</Field>
                  <Button variant="secondary" disabled={!when} loading={a.busy === 'meet'}
                    onClick={() => void a.run('meet', () => adminApi.proposeMeeting(id, new Date(when).toISOString(), format, hint, crypto.randomUUID()), inv)}>Propose</Button>
                </section>
              ) : null}
            </>
          ) : null}

          {data.can_manage ? (
            <section className="card stack-sm">
              <h2>Private notes</h2>
              {(data.notes ?? []).map((n: Row) => (
                <div key={n.id} className="small"><span className="xsmall muted">{n.author} · {dt(n.at)} · {n.scope}</span><p style={{ whiteSpace: 'pre-line' }}>{n.body}</p></div>
              ))}
              <Textarea aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Operational notes. Never visible to families." />
              <Select aria-label="Note visibility" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="BROKERS">Brokers & admins</option><option value="ADMINS">Admins only</option>
              </Select>
              <Button variant="secondary" disabled={!note.trim()} loading={a.busy === 'note'}
                onClick={() => void a.run('note', async () => { await adminApi.addNote(id, note, scope); setNote(''); }, inv)}>Add note</Button>
            </section>
          ) : <Notice tone="neutral">Notes are visible to the assigned broker and admins.</Notice>}
          {a.errorView}
        </div>
      </div>
    </>
  );
}
