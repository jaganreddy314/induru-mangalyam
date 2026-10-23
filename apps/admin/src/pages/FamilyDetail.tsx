import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Field, Icon, Input, Select, Textarea } from '@induru/shared';
import { adminApi, signedUrl, type Row } from '../api';
import { EvidenceViewer, Loadable, Logged, PageTitle, S, d, dt, useAction } from '../ui';

const CHECKS = [
  ['reference_contacted', 'Reference contacted and confirmed the family'],
  ['eligibility_documented', 'Eligibility checked against the documented criteria'],
  ['no_duplicate', 'No duplicate or conflicting family account'],
  ['no_aadhaar_retained', 'No Aadhaar / ID numbers retained in notes or uploads'],
] as const;

/** A03 family detail + A02 decision + A05 scoped evidence access. */
export default function FamilyDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['family', id], queryFn: () => adminApi.family(id) });
  return <Loadable q={q}>{(data) => <Detail data={data} />}</Loadable>;
}

function Detail({ data }: { data: Row }) {
  const f = data.family;
  const openCase: Row | undefined = data.cases.find((c: Row) => ['PENDING', 'IN_REVIEW', 'MORE_INFO'].includes(c.status));
  const a = useAction();
  const [decision, setDecision] = useState('APPROVE');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const inv = ['family', 'membership', 'overview'];
  const [viewing, setViewing] = useState<{ id: string; url: string; label: string; expires: string } | null>(null);

  // Opens inside the watermarked viewer; never as a download or new tab. Denials are audited server side.
  const openDoc = (e: Row) => a.run(`ev-${e.id}`, async () => {
    const r = await adminApi.openEvidence(e.id);
    setViewing({ id: e.id, url: await signedUrl('evidence', r.storage_path), label: String(r.type).replace(/_/g, ' ').toLowerCase(), expires: e.expires_at });
  });

  return (
    <>
      <PageTitle kicker={<span className="num">{f.code}</span>} title={f.name} sub={<>{f.hometown} · {f.district}</>} action={<><S v={f.status} /><Logged /></>} />
      <div className="cols">
        <div className="stack">
          <section className="card stack-sm">
            <h2>Members</h2>
            <table className="tbl">
              <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>{data.members.map((m: Row) => (
                <tr key={m.user_id}><td>{m.name ?? '—'} {m.is_primary ? <S v="PRIMARY" /> : null}</td><td>{m.relation}</td><td className="mono">••{m.phone_last4}</td>
                  <td>{m.active ? <S v={m.user_status} /> : <S v="LEFT" />}</td><td>{d(m.joined_at)}</td></tr>
              ))}</tbody>
            </table>
          </section>

          <section className="card stack-sm">
            <h2>References</h2>
            {data.referrals.length ? data.referrals.map((r: Row) => (
              <div key={r.id} className="row-between wrap">
                <div className="small"><strong>{r.referee_name}</strong> {r.referee_family_code ? <span className="mono">({r.referee_family_code})</span> : null}<br />
                  <span className="muted">{r.referee_phone ?? 'no phone'} · {r.relation_to_applicant ?? '—'}</span></div>
                <div className="row"><S v={r.check_status} />
                  <Button small variant="secondary" onClick={() => void a.run('ref', () => adminApi.markReferral(r.id, 'CONFIRMED'), inv)}>Confirmed</Button>
                  <Button small variant="ghost" onClick={() => void a.run('ref', () => adminApi.markReferral(r.id, 'UNCONFIRMED'), inv)}>Unconfirmed</Button>
                </div>
              </div>
            )) : <p className="muted small">No references given.</p>}
          </section>

          {viewing ? (
            <section className="card stack-sm" style={{ background: 'var(--canvas)' }}>
              <div className="row-between small"><strong style={{ textTransform: 'capitalize' }}>{viewing.label}</strong>
                <Button small variant="ghost" onClick={() => setViewing(null)}><Icon name="x" size={16} />Close</Button></div>
              <EvidenceViewer url={viewing.url} label={viewing.label} />
              <div className="xsmall muted row" style={{ gap: 8 }}><Icon name="timer" size={15} />Evidence auto-deletes {d(viewing.expires)}. Link expires in 60 seconds.</div>
            </section>
          ) : null}
          <section className="card stack-sm">
            <h2>Verification cases & evidence</h2>
            {data.cases.map((c: Row) => (
              <div key={c.id} className="stack-sm">
                <div className="row-between"><span className="small">Opened {d(c.created_at)}</span><S v={c.status} /></div>
                {c.reasons ? <p className="small muted">{c.reasons}</p> : null}
                {c.evidence.map((e: Row) => (
                  <div key={e.id} className="row-between small">
                    <span className="row" style={{ gap: 8 }}><Icon name="fileLock" size={16} style={{ color: 'var(--maroon)' }} /><span>{String(e.type).replace(/_/g, ' ').toLowerCase()} · uploaded {d(e.uploaded_at)} · <span className="muted">deletes {d(e.expires_at)}</span></span></span>
                    {e.deleted ? <S v="DELETED" /> : (
                      <div className="row">
                        <S v={e.review_status} />
                        <Button small variant="secondary" loading={a.busy === `ev-${e.id}`} onClick={() => void openDoc(e)}>View</Button>
                        <Button small variant="ghost" onClick={() => void a.run('evr', () => adminApi.reviewEvidence(e.id, 'ACCEPTED'), inv)}>Accept</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <p className="xsmall muted">Documents open only for the assigned reviewer of an open case, in a watermarked viewer via 60-second links. Every attempt is audited.</p>
          </section>

          <section className="card stack-sm">
            <h2>Candidates</h2>
            {data.candidates.length ? data.candidates.map((c: Row) => (
              <Link key={c.id} to={`/candidates/${c.id}`} className="row-between small" style={{ color: 'inherit' }}>
                <span><strong>{c.first_name}</strong> <span className="mono">{c.code}</span> · {c.relationship} {c.claimed ? '' : '· not claimed'}</span>
                <span className="row">{c.suspended ? <S v="SUSPENDED" /> : null}<S v={c.status} /></span>
              </Link>
            )) : <p className="muted small">No candidate profiles.</p>}
          </section>

          <section className="card stack-sm">
            <h2>Permission history</h2>
            {data.permission_history.length ? (
              <table className="tbl"><thead><tr><th>Candidate</th><th>Delegate</th><th>Capability</th><th>Granted</th><th>Revoked</th></tr></thead>
                <tbody>{data.permission_history.map((p: Row, i: number) => (
                  <tr key={i}><td className="mono">{p.candidate_code}</td><td>{p.delegate}</td><td>{p.capability}</td><td>{dt(p.granted_at)}</td><td>{p.revoked_at ? dt(p.revoked_at) : '—'}</td></tr>
                ))}</tbody></table>
            ) : <p className="muted small">None.</p>}
          </section>
        </div>

        <div className="stack">
          {openCase ? (
            <section className="card stack">
              <h2>Decision</h2>
              {!openCase.reviewer_id ? (
                <Button onClick={() => void a.run('assign', () => adminApi.assignCase(openCase.id), inv)} loading={a.busy === 'assign'}>Assign to me</Button>
              ) : null}
              <div className="stack-sm">
                {CHECKS.map(([k, label]) => (
                  <Checkbox key={k} label={label} checked={!!checklist[k]} onChange={(e) => setChecklist({ ...checklist, [k]: e.target.checked })} />
                ))}
              </div>
              <Field label="Decision">
                {(p) => (
                  <Select {...p} value={decision} onChange={(e) => setDecision(e.target.value)}>
                    <option value="APPROVE">Approve membership</option>
                    <option value="NEEDS_INFO">Request more information</option>
                    <option value="DECLINE">Decline</option>
                  </Select>
                )}
              </Field>
              <Field label="Message to applicant" hint="Shown to the family. Required unless approving." optional={decision === 'APPROVE'}>
                {(p) => <Textarea {...p} value={message} onChange={(e) => setMessage(e.target.value)} />}
              </Field>
              <Field label="Internal notes" hint="Staff only." optional>{(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
              {decision === 'APPROVE' && !CHECKS.every(([k]) => checklist[k]) ? <p className="xsmall muted center">Approve unlocks after every check is recorded</p> : null}
              <Button loading={a.busy === 'decide'} disabled={decision === 'APPROVE' && !CHECKS.every(([k]) => checklist[k])}
                onClick={() => void a.run('decide', () => adminApi.decideMembership(f.id, decision, message, notes, checklist), inv)}>Record decision</Button>
              <p className="xsmall muted">Approval never publishes a candidate profile.</p>
            </section>
          ) : null}

          {['APPROVED', 'SUSPENDED'].includes(f.status) ? (
            <section className="card stack-sm">
              <h2>{f.status === 'SUSPENDED' ? 'Reinstate family' : 'Suspend family'}</h2>
              <Field label="Reason (audited)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
              <Button variant={f.status === 'SUSPENDED' ? 'teal' : 'danger'} disabled={!reason.trim()} loading={a.busy === 'susp'}
                onClick={() => void a.run('susp', () => adminApi.setFamilySuspension(f.id, f.status !== 'SUSPENDED', reason), inv)}>
                {f.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
              </Button>
            </section>
          ) : null}

          <section className="card stack-sm small">
            <h2>Record</h2>
            <p>Declared eligibility: {dt(f.eligibility_declared_at)}</p>
            <p>Decided: {dt(f.decided_at)}</p>
            {f.applicant_message ? <p>Applicant message: {f.applicant_message}</p> : null}
            {f.internal_notes ? <p className="muted" style={{ whiteSpace: 'pre-line' }}>Notes: {f.internal_notes}</p> : null}
            <p>Reports involving this family: {data.reports}</p>
          </section>
          {a.errorView}
        </div>
      </div>
    </>
  );
}
