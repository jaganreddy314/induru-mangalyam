import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, Seg } from '../ui';
import { SupportCase } from './SupportDetail';

const SEV_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} day${m < 2880 ? '' : 's'}`;
};

/** A08 — case list beside the selected case. Urgent cases (pressure, impersonation) are listed first. */
export default function Support() {
  const { id } = useParams();
  const [status, setStatus] = useState<'' | 'ESCALATED' | 'RESOLVED' | 'CLOSED'>('');
  const q = useQuery({ queryKey: ['support', status], queryFn: () => adminApi.support(status || undefined), refetchInterval: 60_000 });
  const rows = [...(q.data ?? [])].sort((a: Row, b: Row) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const selected = id ?? rows[0]?.id;
  const urgent = rows.filter((r: Row) => r.severity === 'URGENT').length;
  return (
    <>
      <PageTitle title="Support & grievances" action={<Seg value={status} onChange={setStatus} options={[{ v: '', label: 'Open' }, { v: 'ESCALATED', label: 'Escalated' }, { v: 'RESOLVED', label: 'Resolved' }, { v: 'CLOSED', label: 'Closed' }]} />} />
      <div className="split cases">
        <div className="list-pane">
          <div className="pane-head" style={{ padding: '18px 24px' }}>
            <div className="small muted">{rows.length} {status ? status.toLowerCase() : 'open'}{urgent ? ` · ${urgent} urgent` : ''}</div>
          </div>
          <Loadable q={{ ...q, data: q.data ? rows : undefined }} empty="No cases.">
            {(list) => list.map((r: Row) => (
              <Link key={r.id} to={`/support/${r.id}`} className={`case-item${r.id === selected ? ' active' : ''}${r.severity === 'URGENT' ? ' urgent' : ''}`}>
                <div className="row-between" style={{ fontSize: 12 }}>
                  <span className={`sev ${r.severity}`}>{r.severity}</span>
                  <span className="muted num">{String(r.id).slice(0, 8).toUpperCase()} · {ago(r.created_at)}</span>
                </div>
                <div className="t" style={{ textTransform: 'capitalize' }}>{String(r.category).replace(/_/g, ' ').toLowerCase()}</div>
                <div className="xsmall muted">Reported by {r.reporter}{r.related_code ? ` · about ${r.related_code}` : ''}</div>
              </Link>
            ))}
          </Loadable>
        </div>
        <div className="detail-pane">{selected ? <SupportCase key={selected} id={selected} /> : <p className="muted small" style={{ padding: 28 }}>Select a case.</p>}</div>
      </div>
    </>
  );
}
