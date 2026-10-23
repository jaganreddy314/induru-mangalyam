import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, S, d, useAction } from '../ui';

/** A05 — verification workspace: open membership and candidate cases, assignment. */
export default function Verification() {
  const navigate = useNavigate();
  const fam = useQuery({ queryKey: ['membership', ''], queryFn: () => adminApi.membershipQueue() });
  const cand = useQuery({ queryKey: ['candidates', 'UNDER_REVIEW'], queryFn: () => adminApi.candidateQueue('UNDER_REVIEW') });
  const a = useAction();

  const rows = (): Row[] => [
    ...(fam.data ?? []).filter((r) => r.case_id).map((r) => ({ kind: 'Membership', id: r.case_id, label: r.family_name, status: r.case_status, reviewer: r.reviewer, at: r.submitted_at, to: `/families/${r.family_id}` })),
    ...(cand.data ?? []).filter((r) => r.case_id).map((r) => ({ kind: 'Candidate', id: r.case_id, label: `${r.first_name} (${r.code})`, status: r.case_status, reviewer: r.reviewer, at: r.updated_at, to: `/candidates/${r.candidate_id}` })),
  ];

  return (
    <>
      <PageTitle title="Verification workspace" sub="Self-assign a case to open its documents. Evidence access is limited to the assigned reviewer and expires automatically." />
      <Loadable q={{ isLoading: fam.isLoading || cand.isLoading, error: fam.error ?? cand.error, data: fam.data && cand.data ? rows() : undefined, refetch: () => { void fam.refetch(); void cand.refetch(); } }} empty="No open cases.">
        {(list) => (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Type</th><th>Subject</th><th>Case</th><th>Reviewer</th><th>Since</th><th /></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id}>
                  <td>{r.kind}</td><td><a href={r.to} onClick={(e) => { e.preventDefault(); navigate(r.to); }}>{r.label}</a></td>
                  <td><S v={r.status} /></td><td>{r.reviewer ?? <span className="muted">unassigned</span>}</td><td>{d(r.at)}</td>
                  <td>{!r.reviewer ? <Button small variant="secondary" loading={a.busy === r.id} onClick={() => void a.run(r.id, () => adminApi.assignCase(r.id), ['membership', 'candidates', 'overview'])}>Assign to me</Button> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Loadable>
      {a.errorView}
    </>
  );
}
