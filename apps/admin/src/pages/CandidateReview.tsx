import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Icon, Input, Textarea } from '@induru/shared';
import { adminApi, signedUrl, type Row } from '../api';
import { EvidenceViewer, Json, Loadable, Logged, PageTitle, S, dt, useAction } from '../ui';

const GATE_LABELS: Record<string, string> = {
  membership_approved: 'Family membership approved',
  claimed_by_candidate: 'Candidate signed in on own account',
  participate_consent: 'Participation consent (by candidate)',
  publish_consent: 'Publication consent (by candidate)',
  meets_min_age: 'Meets legal minimum age',
  not_suspended: 'Not suspended',
  discoverable: 'Currently discoverable',
};
const CHECKS = [
  ['details_consistent', 'Biodata consistent and respectful'],
  ['identity_checked', 'Identity checked via approved method (no ID numbers stored)'],
  ['photo_appropriate', 'Photo appropriate (if any)'],
] as const;

/** A04/A05 — verification workspace: checklist | watermarked viewer | stated details + decision.
 *  Approve stays disabled until the required checks are recorded. */
export default function CandidateReview() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['candidate', id], queryFn: () => adminApi.candidate(id) });
  return <Loadable q={q}>{(data) => <Review data={data} id={id} />}</Loadable>;
}

const DECISIONS = [
  { v: 'VERIFY', label: 'Matches — verify & activate' },
  { v: 'MORE_INFO', label: 'Ask for changes' },
  { v: 'FAIL', label: 'Mismatch — fail verification' },
] as const;

function Review({ data, id }: { data: Row; id: string }) {
  const c = data.candidate;
  const det = data.details;
  const openCase: Row | undefined = data.cases.find((x: Row) => ['PENDING', 'IN_REVIEW', 'MORE_INFO'].includes(x.status));
  const a = useAction();
  const [decision, setDecision] = useState<string>('VERIFY');
  const [message, setMessage] = useState('');
  const [photoOk, setPhotoOk] = useState<boolean>(!!det.photo_approved);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const inv = ['candidate', 'candidates', 'overview'];
  const photo = useQuery({ queryKey: ['cand-photo', det.photo_path], enabled: !!det.photo_path, queryFn: () => signedUrl('photos', det.photo_path) });
  const firstOpen = CHECKS.find(([k]) => !checklist[k])?.[0];
  const allChecked = CHECKS.every(([k]) => checklist[k]);

  return (
    <>
      <PageTitle title={<>Candidate verification · <span className="num">{c.code}</span></>}
        sub={<>{det.first_name} · Family <Link to={`/families/${data.family.id}`}>{data.family.name}</Link> · {String(data.family.relationship).toLowerCase()}</>}
        action={<><div className="row" style={{ gap: 6 }}>{c.suspended_at ? <S v="SUSPENDED" /> : null}<S v={c.status} /></div><Logged /></>} />
      <div className="workspace">
        <aside>
          <div className="sec-label" style={{ marginBottom: 0 }}>Checklist</div>
          {Object.entries(GATE_LABELS).map(([k, label]) => (
            <div key={k} className={`chk ${data.gates[k] ? 'ok' : 'no'}`}>
              <Icon name={data.gates[k] ? 'circleCheck' : 'circle'} size={18} style={{ flex: 'none' }} />
              <div><div className="t">{label}</div>{k === 'discoverable' ? <div className="s">Visibility: {String(data.gates.visibility).toLowerCase()}</div> : null}</div>
            </div>
          ))}
          <div className="sec sec-label" style={{ marginBottom: 0 }}>Reviewer checks</div>
          {CHECKS.map(([k, label]) => (
            <label key={k} className={`chk ${checklist[k] ? 'ok' : k === firstOpen && openCase ? 'cur' : 'no'}`} style={{ cursor: openCase ? 'pointer' : 'default' }}>
              <input type="checkbox" className="visually-hidden" disabled={!openCase} checked={!!checklist[k]} onChange={(e) => setChecklist({ ...checklist, [k]: e.target.checked })} />
              <Icon name={checklist[k] ? 'circleCheck' : k === firstOpen && openCase ? 'circleDot' : 'circle'} size={18} style={{ flex: 'none' }} />
              <div><div className="t">{label}</div></div>
            </label>
          ))}
          {det.photo_path ? (
            <label className={`chk ${photoOk ? 'ok' : 'no'}`} style={{ cursor: 'pointer' }}>
              <input type="checkbox" className="visually-hidden" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} />
              <Icon name={photoOk ? 'circleCheck' : 'circle'} size={18} style={{ flex: 'none' }} /><div><div className="t">Photo approved</div><div className="s">Only shown as the candidate chooses</div></div>
            </label>
          ) : null}
        </aside>

        <section>
          <div className="row-between small"><strong>{det.photo_path ? 'Photo review' : 'Profile photo'}</strong><span className="xsmall muted">Signed link · 60 seconds</span></div>
          <EvidenceViewer url={photo.data ?? null} label="Candidate photo" />
          <div className="xsmall muted row" style={{ gap: 8 }}><Icon name="timer" size={15} />Date of birth and contact details are not shown in staff views; age and gates are computed server side.</div>
          <div className="card stack-sm">
            <h2>Change history</h2>
            {data.history.length ? data.history.map((h: Row, i: number) => (
              <div key={i} className="stack-sm"><span className="xsmall muted">{dt(h.at)} · {h.by ?? 'system'}</span><Json value={h.changes} /></div>
            )) : <p className="muted small">No edits since creation.</p>}
          </div>
          <div className="card card-flush">
            <div className="card-head"><h2>Consent history</h2></div>
            <table className="tbl"><thead><tr><th>Type</th><th>Policy</th><th>By candidate</th><th>Granted</th><th>Revoked</th></tr></thead>
              <tbody>{data.consents.map((x: Row, i: number) => (
                <tr key={i}><td>{String(x.type).toLowerCase()}</td><td className="num">{x.policy_version}</td><td>{x.by_candidate ? 'Own sign-in' : <S v="NO" />}</td><td className="num">{dt(x.granted_at)}</td><td className="num">{x.revoked_at ? dt(x.revoked_at) : '—'}</td></tr>
              ))}</tbody></table>
          </div>
        </section>

        <aside>
          <div className="dp-body" style={{ padding: 24 }}>
            <div className="sec-label" style={{ marginBottom: 0 }}>Stated by candidate</div>
            <dl className="kv">
              <dt>Age</dt><dd>{det.age} · {String(det.gender).toLowerCase()}</dd>
              <dt>Marital status</dt><dd>{String(det.marital_status).replace(/_/g, ' ').toLowerCase()}</dd>
              <dt>Education</dt><dd>{det.education ?? '—'}</dd>
              <dt>Profession</dt><dd>{det.profession ?? '—'}</dd>
              <dt>City</dt><dd>{[det.city, det.district, det.state].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Height</dt><dd>{det.height_cm ? `${det.height_cm} cm` : '—'}</dd>
            </dl>
            {det.bio ? <p className="small" style={{ whiteSpace: 'pre-line' }}><span className="muted">Bio · </span>{det.bio}</p> : null}
            {det.family_summary ? <p className="small" style={{ whiteSpace: 'pre-line' }}><span className="muted">Family · </span>{det.family_summary}</p> : null}
            {Object.keys(det.customs ?? {}).length ? <p className="small"><span className="muted">Traditional · </span>{Object.entries(det.customs).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p> : null}

            {openCase ? (
              <div className="sec stack-sm">
                {!openCase.reviewer_id ? <Button onClick={() => void a.run('assign', () => adminApi.assignCase(openCase.id), inv)} loading={a.busy === 'assign'}>Assign to me</Button> : null}
                <div style={{ fontWeight: 600, fontSize: 14 }}>Does the profile check out?</div>
                {DECISIONS.map((o) => (
                  <label key={o.v} className="radio-card">
                    <input type="radio" name="decision" checked={decision === o.v} onChange={() => setDecision(o.v)} />
                    <span className="dot-radio" style={{ width: 18, height: 18 }} />{o.label}
                  </label>
                ))}
                <Field label="Message to candidate" optional={decision === 'VERIFY'}>{(p) => <Textarea {...p} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Visible to the candidate" />}</Field>
              </div>
            ) : <p className="sec small muted">No open verification case.</p>}
          </div>
          {openCase ? (
            <div className="dp-foot">
              <Button loading={a.busy === 'decide'} disabled={decision === 'VERIFY' && !allChecked}
                onClick={() => void a.run('decide', () => adminApi.decideCandidate(id, decision, message, det.photo_path ? photoOk : null, checklist), inv)}>Record decision</Button>
              <p className="xsmall muted center">{decision === 'VERIFY' && !allChecked ? 'Verify unlocks after every reviewer check is recorded' : 'Activation is refused by the server unless every gate passes'}</p>
              {a.errorView}
            </div>
          ) : null}
          <div className="dp-foot">
            <Field label={c.suspended_at ? 'Reason to lift suspension (audited)' : 'Reason to suspend (audited)'}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            {c.suspended_reason ? <p className="xsmall muted">Current reason: {c.suspended_reason}</p> : null}
            <Button small variant={c.suspended_at ? 'teal' : 'danger'} disabled={!reason.trim()} loading={a.busy === 'susp'}
              onClick={() => void a.run('susp', () => adminApi.setCandidateSuspension(id, !c.suspended_at, reason), inv)}>
              {c.suspended_at ? 'Lift suspension' : 'Suspend profile'}
            </Button>
            {!openCase ? a.errorView : null}
          </div>
        </aside>
      </div>
    </>
  );
}
