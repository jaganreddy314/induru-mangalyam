import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Field, Icon, Notice, Sheet, Textarea } from '@induru/shared';
import { adminApi, type Row } from '../api';
import { Loadable, PageTitle, useAction } from '../ui';

const REASON_LABELS: Record<string, string> = {
  AGE_IN_PREFERRED_RANGE: 'Age within their preference',
  PREFERRED_DISTRICT: 'In a preferred district',
  SAME_DISTRICT: 'Same district',
  MUTUAL_AGE_PREFERENCE: 'Mutual age preference',
  OPEN_TO_RELOCATION: 'Open to relocation',
};
// I1 gates — every row returned by the server already passes all five; shown so staff can see why.
const GATES = [
  { icon: 'home', label: 'Family membership approved' },
  { icon: 'shieldCheck', label: 'Verified candidate' },
  { icon: 'userCheck', label: 'Publication consent' },
  { icon: 'eye', label: 'Visibility allows brokers' },
  { icon: 'circleCheck', label: 'No suspension' },
] as const;

/** A06 — eligible profiles only (consent + visibility gates), explainable rule-based reasons. */
export default function Matchmaking() {
  const [forCode, setForCode] = useState('');
  const [forCandidate, setForCandidate] = useState<Row | null>(null);
  const [filters, setFilters] = useState<Row>({});
  const [suggest, setSuggest] = useState<Row | null>(null);
  const [rationale, setRationale] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const a = useAction();

  const results = useQuery({
    queryKey: ['match-search', forCandidate?.candidate_id, filters],
    queryFn: () => adminApi.matchSearch(filters, forCandidate?.candidate_id),
  });

  const pick = () => a.run('pick', async () => {
    const r = await adminApi.matchSearch({ code: forCode.trim() });
    if (!r.length) throw new Error('No eligible candidate with that code.');
    setForCandidate(r[0]);
  });
  const set = (k: string, v: string) => setFilters({ ...filters, [k]: v || undefined });

  return (
    <>
      <PageTitle
        kicker={forCandidate ? 'Recommending for' : 'Matchmaking'}
        title={forCandidate ? <span className="display" style={{ fontSize: 34 }}><span className="num">{forCandidate.code}</span> · {forCandidate.age}</span> : 'Find suggestions'}
        sub={forCandidate ? [forCandidate.profession, forCandidate.city ?? forCandidate.district, forCandidate.gender?.toLowerCase()].filter(Boolean).join(' · ') : 'Choose the candidate you are recommending for, or browse all eligible profiles.'}
        action={forCandidate
          ? <Button small variant="secondary" onClick={() => { setForCandidate(null); setForCode(''); }}>Change candidate</Button>
          : <>
              <label className="filter-pill"><Icon name="search" size={14} />
                <input value={forCode} onChange={(e) => setForCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && void pick()} placeholder="IM-XXXXXXX" aria-label="Candidate code" style={{ width: 130 }} className="num" />
              </label>
              <Button small onClick={() => void pick()} loading={a.busy === 'pick'}>Select</Button>
            </>} />
      <div className="row wrap" style={{ gap: 8, marginBottom: 14, fontSize: 14 }}>
        <label className="filter-pill">Gender
          <select value={filters.gender ?? ''} onChange={(e) => set('gender', e.target.value)}><option value="">Any</option><option value="FEMALE">Female</option><option value="MALE">Male</option></select>
        </label>
        <label className="filter-pill">Age <input type="number" value={filters.age_min ?? ''} onChange={(e) => set('age_min', e.target.value)} style={{ width: 44 }} aria-label="Age from" />–
          <input type="number" value={filters.age_max ?? ''} onChange={(e) => set('age_max', e.target.value)} style={{ width: 44 }} aria-label="Age to" /></label>
        <label className="filter-pill">District <input value={filters.district ?? ''} onChange={(e) => set('district', e.target.value)} style={{ width: 110 }} placeholder="Any" /></label>
        <label className="filter-pill">Profession <input value={filters.profession ?? ''} onChange={(e) => set('profession', e.target.value)} style={{ width: 120 }} placeholder="Any" /></label>
      </div>
      <div className="banner-ok" style={{ marginBottom: 0 }}><Icon name="filter" size={15} />Showing only profiles that pass all five gates: membership, verified candidate, publication consent, visibility, no suspension.</div>
      {a.errorView}
      {done ? <div style={{ marginTop: 12 }}><Notice tone="success">{done}</Notice></div> : null}

      <div style={{ margin: '0 -36px' }}>
        <Loadable q={results} empty="No eligible profiles match.">
          {(rows) => (
            <table className="tbl" style={{ background: 'var(--surface)' }}>
              <thead><tr><th style={{ paddingLeft: 32 }}>Code</th><th>Profile</th><th>Why suggested</th><th>Gates</th><th /></tr></thead>
              <tbody>{rows.map((r: Row) => (
                <tr key={r.candidate_id}>
                  <td className="num" style={{ paddingLeft: 32, fontWeight: 600, color: 'var(--ink)' }}>{r.code}</td>
                  <td><strong>{r.age} · {r.city ?? r.district ?? '—'}</strong><br /><span className="muted">{[r.profession, r.education].filter(Boolean).join(' · ') || '—'}</span>
                    {r.visibility === 'BROKER_ONLY' ? <div style={{ marginTop: 4 }}><Badge tone="gold">Broker only</Badge></div> : null}</td>
                  <td className="body2">{(r.reasons ?? []).length ? (r.reasons as string[]).map((x) => REASON_LABELS[x] ?? x).join('; ') + '.' : <span className="muted">No rule matched — browse only</span>}</td>
                  <td><span className="gates">{GATES.map((g) => <span key={g.label} title={g.label}><Icon name={g.icon} size={16} /></span>)}</span></td>
                  <td style={{ paddingRight: 32 }}>{forCandidate ? (r.open_match
                    ? <Button small variant="secondary" disabled>Already linked</Button>
                    : <Button small onClick={() => { setSuggest(r); setRationale(''); setDone(null); }}>Recommend</Button>) : null}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Loadable>
        <p className="xsmall muted row" style={{ gap: 8, padding: '16px 32px' }}><Icon name="info" size={15} />Recommending sends a suggestion to each candidate separately. No contact or photo is shared by this action.</p>
      </div>

      <Sheet open={!!suggest} onClose={() => setSuggest(null)} title="Recommend introduction">
        <p className="small">Suggest <strong className="num">{suggest?.code}</strong> to <strong className="num">{forCandidate?.code}</strong>. Both candidates decide independently; no contact data is released until both accept and grant it.</p>
        <Field label="Why this match (staff only, audited)">{(p) => <Textarea {...p} value={rationale} onChange={(e) => setRationale(e.target.value)} />}</Field>
        <Button block disabled={!rationale.trim()} loading={a.busy === 'suggest'} onClick={() => void a.run('suggest', async () => {
          const r = await adminApi.suggestMatch(forCandidate!.candidate_id, suggest!.candidate_id, rationale);
          setDone(r.duplicate ? 'These two profiles already have an open request.' : 'Suggestion sent to both sides.');
          setSuggest(null);
        }, ['match-search'])}>Send suggestion</Button>
      </Sheet>
    </>
  );
}
