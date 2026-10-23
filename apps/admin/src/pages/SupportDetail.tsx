import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, CardSkeleton, Field, Icon, Input, Select, Textarea } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { S, dt, useAction } from '../ui';

const RISK: Record<string, { icon: 'alert' | 'eyeOff' | 'user' | 'lock'; label: string }> = {
  PRESSURE: { icon: 'alert', label: 'Coercion reported' },
  IMPERSONATION: { icon: 'user', label: 'Possible impersonation' },
  HARASSMENT: { icon: 'alert', label: 'Harassment reported' },
  DATA_MISUSE: { icon: 'lock', label: 'Data misuse reported' },
};

/** A08 case pane — triage, protective actions, assignment, outcome. Every action is audited. */
export function SupportCase({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['support-case', id], queryFn: () => adminApi.supportCase(id) });
  const staff = useQuery({ queryKey: ['staff', 'moderator'], queryFn: () => adminApi.staffUsers('moderator') });
  if (q.isLoading) return <div style={{ padding: 28 }}><CardSkeleton count={2} /></div>;
  if (!q.data) return null;
  return <Detail c={q.data} id={id} staff={staff.data ?? []} />;
}

function Detail({ c, id, staff }: { c: Row; id: string; staff: { user_id: string; name: string | null }[] }) {
  const a = useAction();
  const [status, setStatus] = useState<string>(c.status);
  const [severity, setSeverity] = useState<string>(c.severity);
  const [assignee, setAssignee] = useState<string>(c.assignee_id ?? '');
  const [resolution, setResolution] = useState<string>(c.resolution ?? '');
  const [reason, setReason] = useState('');
  const inv = ['support-case', 'support', 'overview'];
  const rc = c.related_candidate;
  const assigneeName = staff.find((s) => s.user_id === c.assignee_id)?.name;
  const save = (patch: Row) => a.run('save', () => adminApi.updateSupport(id, { status, severity, assignee_id: assignee || null, resolution, ...patch }), inv);
  const risk = RISK[c.category];

  return (
    <>
      <div className="dp-head row-between" style={{ alignItems: 'flex-start', gap: 20, padding: '22px 32px' }}>
        <div>
          <div className="num" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', color: 'var(--slate)' }}>
            {String(c.id).slice(0, 8).toUpperCase()} · {String(c.status).replace(/_/g, ' ')}{assigneeName ? ` · ASSIGNED TO ${assigneeName.toUpperCase()}` : ' · UNASSIGNED'}
          </div>
          <h2 className="display" style={{ fontSize: 34, margin: '6px 0 0', textTransform: 'capitalize' }}>{String(c.category).replace(/_/g, ' ').toLowerCase()}</h2>
        </div>
        {rc && !rc.suspended ? (
          <Button variant="danger-fill" disabled={!reason.trim()} loading={a.busy === 'susp'} title={!reason.trim() ? 'Enter a reason below first' : undefined}
            onClick={() => void a.run('susp', () => adminApi.setCandidateSuspension(rc.candidate_id, true, reason), inv)}>
            <Icon name="pause" size={17} />Pause profile {rc.code} now
          </Button>
        ) : rc?.suspended ? <S v="SUSPENDED" /> : null}
      </div>
      <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 32, flex: 1 }}>
        <div className="stack" style={{ gap: 18 }}>
          <div>
            <div className="sec-label">Report</div>
            <p style={{ fontSize: 15, lineHeight: 1.6, textAlign: 'justify', whiteSpace: 'pre-line' }}>“{c.description}”</p>
            <div className="xsmall muted" style={{ marginTop: 6 }}>Submitted {dt(c.created_at)} by {c.reporter.name ?? 'a member'}</div>
          </div>
          <div className="sec">
            <div className="sec-label">Activity</div>
            <div className="stack-sm" style={{ gap: 10, fontSize: 14 }}>
              {c.history.map((h: Row, i: number) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <span className="muted num" style={{ width: 120, flex: 'none' }}>{dt(h.at)}</span>
                  <span>{String(h.action).replace(/^admin\.|^support\./, '').replace(/[._]/g, ' ')}{h.actor ? ` · ${h.actor}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="sec stack-sm">
            <Field label="Outcome recorded for the reporter" hint="Stored on the case; the reporter sees the status change in their app.">
              {(p) => <Textarea {...p} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
            </Field>
            <div className="grid-2">
              <Field label="Status">{(p) => (
                <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {['OPEN', 'TRIAGED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
                </Select>)}</Field>
              <Field label="Severity">{(p) => (
                <Select {...p} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
                </Select>)}</Field>
            </div>
            <Field label="Assignee">{(p) => (
              <Select {...p} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name ?? s.user_id.slice(0, 8)}</option>)}
              </Select>)}</Field>
            <Button loading={a.busy === 'save'} onClick={() => void save({})}>Save</Button>
          </div>
        </div>
        <div className="stack" style={{ gap: 14, fontSize: 14 }}>
          <div className="sec-label" style={{ marginBottom: 0 }}>Risk flags</div>
          {severity === 'URGENT' ? <div className="row" style={{ gap: 8, color: 'var(--rose)' }}><Icon name="alert" size={16} />Urgent severity</div> : null}
          {risk ? <div className="row" style={{ gap: 8, color: 'var(--rose)' }}><Icon name={risk.icon} size={16} />{risk.label}</div> : <span className="muted">None recorded</span>}
          <div className="sec sec-label" style={{ marginBottom: 0 }}>Related</div>
          {rc ? <Link to={`/candidates/${rc.candidate_id}`} className="num">{rc.code} · <S v={rc.status} /></Link> : <span className="muted">No profile linked</span>}
          {c.reporter.family_id ? <Link to={`/families/${c.reporter.family_id}`}>Reporter’s family</Link> : null}
          {rc ? (
            <div className="sec stack-sm">
              <Field label="Reason for protective action (audited)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
              {rc.suspended ? (
                <Button small variant="teal" disabled={!reason.trim()} loading={a.busy === 'susp'}
                  onClick={() => void a.run('susp', () => adminApi.setCandidateSuspension(rc.candidate_id, false, reason), inv)}>Lift profile pause</Button>
              ) : null}
              {rc.owner_user_id ? (
                <Button small variant="danger" disabled={!reason.trim()} loading={a.busy === 'restrict'}
                  onClick={() => void a.run('restrict', () => adminApi.setUserRestriction(rc.owner_user_id, true, reason), inv)}>Restrict account</Button>
              ) : null}
              {rc.family_id ? (
                <Button small variant="danger" disabled={!reason.trim()} loading={a.busy === 'fam'}
                  onClick={() => void a.run('fam', () => adminApi.setFamilySuspension(rc.family_id, true, reason), inv)}>Suspend family</Button>
              ) : null}
            </div>
          ) : null}
          <div className="sec stack-sm">
            <Button small variant="secondary" loading={a.busy === 'save'} onClick={() => { setStatus('ESCALATED'); void save({ status: 'ESCALATED' }); }}>Escalate</Button>
            <Button small variant="danger" style={{ color: 'var(--ink)' }} disabled={!resolution.trim()} title={!resolution.trim() ? 'Record the outcome first' : undefined}
              onClick={() => { setStatus('RESOLVED'); void save({ status: 'RESOLVED' }); }}>Resolve…</Button>
          </div>
          {a.errorView}
        </div>
      </div>
    </>
  );
}
