import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, Icon } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, S, Seg, d, dt, useStaff } from '../ui';

const QUEUES = { open: '', info: 'NEEDS_INFO', decided: 'APPROVED' } as const;
type Queue = keyof typeof QUEUES;
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** A02 membership queue with a detail pane (also the A03 families index). */
export default function Membership({ defaultStatus }: { defaultStatus: string }) {
  const families = defaultStatus === 'APPROVED';
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<Queue>(families ? 'decided' : 'open');
  const [mine, setMine] = useState(false);
  const [district, setDistrict] = useState('');
  const staff = useStaff();
  const status = families ? defaultStatus : QUEUES[queue];
  const q = useQuery({ queryKey: ['membership', status], queryFn: () => adminApi.membershipQueue(status || undefined) });
  const rows = (q.data ?? []).filter((r: Row) => (!mine || r.reviewer === staff.name) && (!district || r.district === district));
  const selected = params.get('f') ?? rows[0]?.family_id;
  const districts = [...new Set((q.data ?? []).map((r: Row) => r.district as string))].sort();
  const overdue = rows.filter((r: Row) => !['APPROVED', 'DECLINED'].includes(r.status) && days(r.submitted_at) > 5).length;

  return (
    <>
      <PageTitle title={families ? 'Families' : 'Membership applications'} action={<span className="small muted">{rows.length} {families ? 'families' : 'open'}{overdue ? ` · ${overdue} overdue` : ''}</span>} />
      <div className="split">
        <div className="list-pane">
          <div className="pane-head">
            <div className="row wrap" style={{ gap: 10 }}>
              {!families ? <Seg value={queue} onChange={setQueue} options={[{ v: 'open', label: 'Open' }, { v: 'info', label: 'Needs info' }, { v: 'decided', label: 'Decided' }]} /> : null}
              <label className="filter-pill">District:
                <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District"><option value="">All</option>{districts.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <button type="button" className="filter-pill" aria-pressed={mine} onClick={() => setMine(!mine)}>{mine ? <Icon name="check" size={14} /> : null}Assigned to me</button>
            </div>
            <p className="xsmall muted">Eligibility is verified through references and documented checks — never inferred from surname.</p>
          </div>
          <Loadable q={{ ...q, data: q.data ? rows : undefined }} empty="No families in this state.">
            {(list) => (
              <table className="tbl">
                <thead><tr><th>Ref</th><th>Family</th><th>Hometown</th><th>Refs</th><th>Submitted</th><th>Status</th></tr></thead>
                <tbody>{list.map((r: Row) => (
                  <tr key={r.family_id} className={`clickable${r.family_id === selected ? ' selected' : ''}`} onClick={() => setParams({ f: r.family_id }, { replace: true })}>
                    <td className="num">{r.family_code}</td>
                    <td><strong>{r.family_name}</strong></td>
                    <td>{r.hometown}</td>
                    <td>{r.referrals || <span className="muted">None</span>}</td>
                    <td className="num" style={days(r.submitted_at) > 5 && !['APPROVED', 'DECLINED'].includes(r.status) ? { color: 'var(--amber)' } : undefined}>{d(r.submitted_at)}</td>
                    <td><S v={r.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Loadable>
        </div>
        <div className="detail-pane">{selected ? <FamilyPane id={selected} /> : <p className="muted small" style={{ padding: 28 }}>Select an application.</p>}</div>
      </div>
    </>
  );
}

function FamilyPane({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['family', id], queryFn: () => adminApi.family(id) });
  const staff = useStaff();
  if (q.isLoading) return <div style={{ padding: 28 }}><CardSkeleton count={2} /></div>;
  if (!q.data) return null;
  const { family: f, referrals, cases, members } = q.data;
  const applicant = members.find((m: Row) => m.is_primary) ?? members[0];
  const openCase: Row | undefined = cases.find((c: Row) => ['PENDING', 'IN_REVIEW', 'MORE_INFO'].includes(c.status));
  const evidence: Row[] = cases.flatMap((c: Row) => c.evidence);
  const refChecked = referrals.some((r: Row) => r.check_status === 'CONFIRMED');
  const pending = ['APPLIED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(f.status);

  return (
    <>
      <div className="dp-head">
        <div className="kick num" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', color: 'var(--slate)' }}>
          {f.code}{pending && f.created_at ? ` · ${days(f.created_at)} DAYS IN QUEUE` : ''}
        </div>
        <h2 className="display" style={{ fontSize: 32, margin: '6px 0 4px' }}>{f.name}</h2>
        {applicant ? <div className="small muted">Applicant: {applicant.name ?? '—'} · <span className="num">+91 ••••• ••{applicant.phone_last4}</span></div> : null}
      </div>
      <div className="dp-body">
        <dl className="kv">
          <dt>Hometown</dt><dd>{[f.hometown, f.district].filter(Boolean).join(', ')}</dd>
          <dt>Declaration</dt><dd>{f.eligibility_declared_at ? `Accepted · ${dt(f.eligibility_declared_at)}` : '—'}</dd>
          <dt>Reviewer</dt><dd>{openCase?.reviewer_id === staff.id ? `${staff.name} (you)` : openCase?.reviewer_id ? 'Another verifier' : 'Unassigned'}</dd>
          <dt>Status</dt><dd><S v={f.status} /></dd>
        </dl>
        <div className="sec">
          <div className="sec-label">Reference</div>
          {referrals.length ? referrals.map((r: Row) => (
            <div key={r.id} className="card" style={{ padding: 14, borderRadius: 10, marginBottom: 8 }}>
              <div className="row-between small"><strong>{r.referee_family_code ? `Member family ${r.referee_family_code}` : r.referee_name}</strong><S v={r.check_status} /></div>
              <div className="xsmall muted">{r.referee_name}{r.relation_to_applicant ? ` · ${r.relation_to_applicant}` : ''}</div>
            </div>
          )) : <p className="small muted">No reference given.</p>}
        </div>
        <div className="sec">
          <div className="sec-label">Evidence</div>
          {evidence.length ? evidence.map((e) => (
            <div key={e.id} className="row small" style={{ gap: 10 }}>
              <Icon name="fileLock" size={18} style={{ color: 'var(--maroon)' }} />
              <span className="grow">{String(e.type).replace(/_/g, ' ').toLowerCase()}</span>
              <span className="xsmall muted">{e.deleted ? 'Deleted' : `Deletes ${d(e.expires_at)}`}</span>
            </div>
          )) : <p className="small muted">No documents uploaded.</p>}
        </div>
      </div>
      <div className="dp-foot">
        <Link to={`/families/${id}`} className="btn btn-primary" style={{ minHeight: 46, fontSize: 17 }}>{pending ? 'Review & decide' : 'Open family record'}</Link>
        {pending && !refChecked ? <div className="xsmall muted center">Approval unlocks after the reference check and checklist are recorded</div> : null}
      </div>
    </>
  );
}
