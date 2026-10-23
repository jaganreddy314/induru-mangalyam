import { Fragment, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, Icon } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Json, Loadable, PageTitle, dt } from '../ui';

const WINDOWS = { '24h': 1, '7d': 7, '30d': 30, all: 0 } as const;
const ALLOWED = new Set(['ALLOWED', 'SUCCESS', 'DONE']);

/** A09 — immutable audit trail; viewing it is itself audited. Denied attempts are tinted and summarised. */
export default function Audit() {
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [win, setWin] = useState<keyof typeof WINDOWS>('24h');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['audit', filters],
    queryFn: ({ pageParam }) => adminApi.audit(filters, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1].at : null),
  });
  const since = WINDOWS[win] ? Date.now() - WINDOWS[win] * 86_400_000 : 0;
  const rows = q.data?.pages.flat().filter((e: Row) => new Date(e.at).getTime() >= since);
  const denied = (rows ?? []).filter((e: Row) => e.outcome === 'DENIED');
  const byActor = denied.reduce<Record<string, number>>((m, e) => ({ ...m, [e.actor ?? 'unknown']: (m[e.actor ?? 'unknown'] ?? 0) + 1 }), {});
  const top = Object.entries(byActor).sort((a, b) => b[1] - a[1])[0];
  const apply = (o = outcome) => setFilters(Object.fromEntries(Object.entries({ action, outcome: o }).filter(([, v]) => v)));

  return (
    <>
      <PageTitle title="Audit log" action={<span className="logged"><Icon name="lock" size={14} />Immutable · your viewing is also logged</span>} />
      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <label className="filter-pill">
          <select value={win} onChange={(e) => setWin(e.target.value as keyof typeof WINDOWS)} aria-label="Time window">
            <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All loaded</option>
          </select>
        </label>
        <label className="filter-pill"><Icon name="search" size={14} />
          <input value={action} onChange={(e) => setAction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="Action starts with…" aria-label="Action prefix" style={{ width: 170 }} />
        </label>
        <button type="button" className="filter-pill" aria-pressed={outcome === 'DENIED'} onClick={() => { const o = outcome === 'DENIED' ? '' : 'DENIED'; setOutcome(o); apply(o); }}>
          {outcome === 'DENIED' ? <Icon name="check" size={14} /> : null}Denied only
        </button>
        <Button small variant="secondary" onClick={() => apply()}>Apply</Button>
      </div>
      {top && top[1] >= 3 ? (
        <div className="banner-warn" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={17} />
          <span className="grow"><strong>Unusual access:</strong> {top[0]} had {top[1]} denied attempts in this window.</span>
          <button type="button" className="link" onClick={() => { setOutcome('DENIED'); apply('DENIED'); }}>Review</button>
        </div>
      ) : null}
      <Loadable q={{ ...q, data: rows }} empty="No events in this window.">
        {(list) => (
          <div className="stack">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Time (IST)</th><th>Actor</th><th>Action</th><th>Object</th><th>Result</th></tr></thead>
                <tbody>{list.map((e: Row) => (
                  <Fragment key={e.id}>
                    <tr className={`clickable${e.outcome === 'DENIED' ? ' urgent' : ''}`} onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{dt(e.at)}</td>
                      <td>{e.actor ?? <span className="muted">System</span>}</td>
                      <td>{String(e.action).replace(/[._]/g, ' ')}</td>
                      <td className="num">{e.object_type ? `${e.object_type} ${String(e.object_id ?? '').slice(0, 8)}` : '—'}</td>
                      <td style={{ color: e.outcome === 'DENIED' ? 'var(--rose)' : ALLOWED.has(e.outcome) ? 'var(--teal)' : undefined, fontWeight: e.outcome === 'DENIED' ? 600 : 400 }}>
                        {String(e.outcome ?? '—').charAt(0) + String(e.outcome ?? '').slice(1).toLowerCase()}
                      </td>
                    </tr>
                    {open === e.id ? (
                      <tr><td colSpan={5} style={{ background: 'var(--ivory)' }}>
                        <div className="xsmall muted" style={{ marginBottom: 6 }}>Request {e.request_id ?? '—'}</div>
                        {Object.keys(e.metadata ?? {}).length ? <Json value={e.metadata} /> : <span className="xsmall muted">No metadata.</span>}
                      </td></tr>
                    ) : null}
                  </Fragment>
                ))}</tbody>
              </table>
            </div>
            {q.hasNextPage ? <Button variant="secondary" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>Load older</Button> : null}
          </div>
        )}
      </Loadable>
    </>
  );
}
