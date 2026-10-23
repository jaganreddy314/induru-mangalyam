import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, d, useStaff } from '../ui';

/** A01 — four queue figures, the items needing action (sorted by due), and housekeeping counts. */
export default function Overview() {
  const staff = useStaff();
  const can = (...r: string[]) => staff.roles.includes('super_admin') || r.some((x) => staff.roles.includes(x as never));
  const q = useQuery({ queryKey: ['overview'], queryFn: adminApi.overview, refetchInterval: 60_000 });
  const support = useQuery({ queryKey: ['support', ''], queryFn: () => adminApi.support(), enabled: can('moderator', 'admin') });
  const members = useQuery({ queryKey: ['membership', ''], queryFn: () => adminApi.membershipQueue(), enabled: can('verifier', 'admin') });
  const cands = useQuery({ queryKey: ['candidates', 'UNDER_REVIEW'], queryFn: () => adminApi.candidateQueue('UNDER_REVIEW'), enabled: can('verifier', 'admin') });

  const action: { ref: string; item: string; sub: string; queue: string; due: string; urgent?: boolean; to: string; sort: number }[] = [
    ...(support.data ?? []).filter((r: Row) => !['RESOLVED', 'CLOSED'].includes(r.status)).map((r: Row) => ({
      ref: String(r.id).slice(0, 8).toUpperCase(), item: String(r.category).replace(/_/g, ' ').toLowerCase(), sub: `${r.reporter ?? 'member'} report`,
      queue: 'Support', due: r.severity === 'URGENT' ? 'Now' : d(r.created_at), urgent: r.severity === 'URGENT', to: `/support/${r.id}`,
      sort: r.severity === 'URGENT' ? 0 : new Date(r.created_at).getTime(),
    })),
    ...(members.data ?? []).filter((r: Row) => ['APPLIED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(r.status)).map((r: Row) => ({
      ref: r.family_code, item: r.family_name, sub: r.case_status ? String(r.case_status).replace(/_/g, ' ').toLowerCase() : 'new application',
      queue: 'Membership', due: d(r.submitted_at), to: `/membership?f=${r.family_id}`, sort: new Date(r.submitted_at).getTime(),
    })),
    ...(cands.data ?? []).map((r: Row) => ({
      ref: r.code, item: 'Candidate profile', sub: 'consent received · awaiting review', queue: 'Verification', due: d(r.updated_at),
      to: `/candidates/${r.candidate_id}`, sort: new Date(r.updated_at).getTime(),
    })),
  ].sort((a, b) => a.sort - b.sort).slice(0, 8);

  return (
    <>
      <PageTitle title="Overview" action={<span className="muted small">Hello, {staff.name}</span>} />
      <Loadable q={q}>
        {(n) => (
          <div className="stack" style={{ gap: 28 }}>
            <div className="kpis">
              <Link to="/membership" className="kpi"><div className="lab">Membership queue</div><div className="n">{n.membership_pending ?? 0}</div>
                <div className={`note${n.membership_needs_info ? ' amber' : ''}`}>{n.membership_needs_info ? <><Icon name="clock" size={14} />{n.membership_needs_info} awaiting applicant</> : 'Nothing waiting on applicants'}</div></Link>
              <Link to="/verification" className="kpi"><div className="lab">Candidate reviews</div><div className="n">{n.candidates_in_review ?? 0}</div>
                <div className="note">{n.my_open_cases ?? 0} assigned to you</div></Link>
              <Link to="/introductions" className="kpi"><div className="lab">Introductions open</div><div className="n">{n.introductions_open ?? 0}</div>
                <div className="note">{n.introductions_unassigned ?? 0} without a broker</div></Link>
              <Link to="/support" className={`kpi${n.reports_urgent ? ' alert' : ''}`}><div className="lab">Open complaints</div><div className="n">{n.reports_open ?? 0}</div>
                <div className="note">{n.reports_urgent ? <><Icon name="alert" size={14} />{n.reports_urgent} urgent</> : 'None urgent'}</div></Link>
            </div>

            <div className="two-col">
              <div className="card card-flush">
                <div className="card-head"><h2>Needs your action</h2><span className="xsmall muted">Urgent first, then oldest</span></div>
                {action.length ? (
                  <table className="tbl">
                    <thead><tr><th>Ref</th><th>Item</th><th>Queue</th><th>Due</th><th /></tr></thead>
                    <tbody>{action.map((r) => (
                      <tr key={`${r.queue}-${r.ref}`} className={r.urgent ? 'urgent' : ''}>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.ref}</td>
                        <td><strong style={{ textTransform: r.queue === 'Support' ? 'capitalize' : undefined }}>{r.item}</strong> · <span className="muted">{r.sub}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.queue}</td>
                        <td style={{ whiteSpace: 'nowrap', ...(r.urgent ? { color: 'var(--rose)', fontWeight: 600 } : {}) }}>{r.due}</td>
                        <td><Link to={r.to} className="open-link">Open</Link></td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <p className="muted small" style={{ padding: 20 }}>Nothing waiting on you.</p>}
              </div>
              <div className="stack" style={{ gap: 20 }}>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <h2 style={{ marginBottom: 12 }}>Totals</h2>
                  <div className="kvs">
                    <span>Active candidates</span><span>{n.active_candidates ?? 0}</span>
                    <span>Matches confirmed</span><span>{n.matches_confirmed ?? 0}</span>
                    <span>Introductions open</span><span>{n.introductions_open ?? 0}</span>
                  </div>
                </div>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <h2 style={{ marginBottom: 12 }}>Housekeeping</h2>
                  <div className="stack-sm" style={{ gap: 10, fontSize: 14 }}>
                    <Link to="/settings" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.data_requests_open ? 'var(--amber)' : 'var(--teal)' }} />
                      <span className="grow">Data requests</span><span className="muted">{n.data_requests_open ? `${n.data_requests_open} open` : 'None open'}</span></Link>
                    <Link to="/settings" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.evidence_expired_pending_deletion ? 'var(--amber)' : 'var(--teal)' }} />
                      <span className="grow">Expired evidence</span><span className={n.evidence_expired_pending_deletion ? '' : 'muted'} style={n.evidence_expired_pending_deletion ? { color: 'var(--amber)' } : undefined}>
                        {n.evidence_expired_pending_deletion ? `${n.evidence_expired_pending_deletion} to purge` : 'Up to date'}</span></Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Loadable>
    </>
  );
}
