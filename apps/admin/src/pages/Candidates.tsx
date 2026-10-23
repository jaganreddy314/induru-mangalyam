import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api';
import { Loadable, PageTitle, S, Tabs, d } from '../ui';

const OPTIONS = [
  { v: 'UNDER_REVIEW', label: 'In review' }, { v: 'AWAITING_CONSENT', label: 'Awaiting consent' },
  { v: 'ACTIVE', label: 'Active' }, { v: 'PAUSED', label: 'Paused' }, { v: 'SUSPENDED', label: 'Suspended' }, { v: 'WITHDRAWN', label: 'Withdrawn' },
];

/** A04 queue. */
export default function Candidates() {
  const [status, setStatus] = useState('UNDER_REVIEW');
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['candidates', status], queryFn: () => adminApi.candidateQueue(status) });
  return (
    <>
      <PageTitle title="Candidates" />
      <Tabs value={status} options={OPTIONS} onChange={setStatus} />
      <Loadable q={q} empty="No candidates in this state.">
        {(rows) => (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Name</th><th>Age</th><th>District</th><th>Family</th><th>Status</th><th>Case</th><th>Reviewer</th><th>Updated</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.candidate_id} className="clickable" onClick={() => navigate(`/candidates/${r.candidate_id}`)}>
                  <td className="mono">{r.code}</td><td>{r.first_name}</td><td>{r.age} · {r.gender?.[0]}</td><td>{r.district ?? '—'}</td>
                  <td>{r.family_name} <S v={r.family_status} /></td><td>{r.suspended ? <S v="SUSPENDED" /> : <S v={r.status} />}</td>
                  <td><S v={r.case_status} /></td><td>{r.reviewer ?? <span className="muted">unassigned</span>}</td><td>{d(r.updated_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Loadable>
    </>
  );
}
