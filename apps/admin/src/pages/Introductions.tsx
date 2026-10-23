import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, d } from '../ui';

const COLUMNS: { key: string; label: string; stages: string[]; rule: string }[] = [
  { key: 'pending', label: 'Pending contact', stages: ['PENDING_CONTACT'], rule: 'var(--amber)' },
  { key: 'introduced', label: 'Introduced', stages: ['INTRODUCED'], rule: 'var(--gold)' },
  { key: 'discussing', label: 'Discussing', stages: ['DISCUSSING'], rule: 'var(--gold)' },
  { key: 'meeting', label: 'Meeting planned', stages: ['MEETING_PLANNED'], rule: 'var(--maroon)' },
  { key: 'closed', label: 'Closed', stages: ['CLOSED', 'MATCH_CONFIRMED'], rule: 'var(--teal)' },
];
const STALL_DAYS = 14;
const age = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** A07 CRM — kanban by stage. Stage moves happen in the detail view and consent stages stay candidate-only. */
export default function Introductions() {
  const [mine, setMine] = useState(false);
  const q = useQuery({ queryKey: ['introductions', '', mine], queryFn: () => adminApi.introductions(undefined, mine) });
  return (
    <>
      <PageTitle title="Introductions" action={
        <button type="button" className="filter-pill" aria-pressed={mine} onClick={() => setMine(!mine)}>{mine ? <Icon name="check" size={14} /> : null}Assigned to me</button>
      } />
      <Loadable q={q} empty="No introductions yet.">
        {(rows) => (
          <div className="kanban">
            {COLUMNS.map((col) => {
              const items = rows.filter((r: Row) => col.stages.includes(r.stage));
              return (
                <div key={col.key} className="kan-col">
                  <div className="kan-head" style={{ borderBottomColor: col.rule }}><span>{col.label}</span><span className="num">{items.length}</span></div>
                  {items.map((r: Row) => {
                    const days = age(r.updated_at);
                    const stalled = col.key !== 'closed' && days > STALL_DAYS;
                    return (
                      <Link key={r.id} to={`/introductions/${r.id}`} className="kan-card">
                        <div className="t">{r.source_code} × {r.target_code}</div>
                        <div style={{ color: stalled ? 'var(--amber)' : 'var(--slate)' }}>
                          {col.key === 'closed' ? d(r.updated_at) : `${days} day${days === 1 ? '' : 's'} in stage${stalled ? ' · stalled' : ''}`}
                        </div>
                        {r.stage === 'MATCH_CONFIRMED' ? <span className="row" style={{ gap: 6, color: 'var(--teal)' }}><Icon name="circleCheck" size={13} />Match confirmed</span>
                          : r.stage === 'CLOSED' ? <span className="muted">Closed</span> : null}
                        <span className="row xsmall" style={{ gap: 6, color: r.broker ? 'var(--slate)' : 'var(--amber)' }}>
                          <Icon name="brokerAssisted" size={13} />{r.broker ?? 'No broker yet'}
                        </span>
                      </Link>
                    );
                  })}
                  {!items.length ? <p className="xsmall muted" style={{ padding: '4px 2px' }}>None</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </Loadable>
    </>
  );
}
