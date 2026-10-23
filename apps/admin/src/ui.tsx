import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, CardSkeleton, EmptyState, ErrorNotice, Icon, fmtDate, fmtDateTime, type StaffRole } from '@induru/shared';

export const StaffContext = createContext<{ id: string; name: string; roles: StaffRole[] }>({ id: '', name: '', roles: [] });
export const useStaff = () => useContext(StaffContext);

export const d = (iso?: string | null) => (iso ? fmtDate(iso, 'en') : '—');
export const dt = (iso?: string | null) => (iso ? fmtDateTime(iso, 'en') : '—');

/** 68px sticky top bar: optional kicker, H1 28px, sub line, right-aligned actions. */
export function PageTitle({ title, sub, action, kicker }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; kicker?: ReactNode }) {
  return (
    <header className="ahead">
      <div style={{ minWidth: 0 }}>
        {kicker ? <div className="kick">{kicker}</div> : null}
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {action ? <div className="row wrap" style={{ gap: 10 }}>{action}</div> : null}
    </header>
  );
}

/** "Your access is logged" marker for sensitive views. */
export function Logged({ children = 'Your access is logged' }: { children?: ReactNode }) {
  return <span className="logged"><Icon name="eye" size={15} />{children}</span>;
}

/** Segmented filter used in admin headers. */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg-admin" role="group">
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

/** In-page document viewer, watermarked with viewer + timestamp. The signed URL lives 60 s and is never
 *  offered as a download; a determined viewer can still screenshot, which is why every open is audited. */
export function EvidenceViewer({ url, mime, label }: { url: string | null; mime?: string; label?: string }) {
  const staff = useStaff();
  const [at] = useState(() => new Date());
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);
  const stamp = `${staff.name} · ${fmtDateTime(at.toISOString(), 'en')} IST`;
  return (
    <div className="viewer" onDragStart={(e) => e.preventDefault()}>
      {url ? (mime === 'application/pdf' || /\.pdf($|\?)/i.test(url)
        ? <iframe src={`${url}#toolbar=0&navpanes=0`} title={label ?? 'Document'} referrerPolicy="no-referrer" />
        : <img src={url} alt={label ?? 'Document'} draggable={false} />)
        : <div className="empty-v"><Icon name="fileLock" size={28} />Secure document viewer · no download, no copy</div>}
      <div className="wm" aria-hidden="true">{stamp}</div>
    </div>
  );
}

export function Loadable<T>({ q, children, empty }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (data: T) => ReactNode; empty?: string }) {
  if (q.isLoading) return <CardSkeleton count={3} />;
  if (q.error) return <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />;
  if (Array.isArray(q.data) && !q.data.length) return <div className="card"><EmptyState icon="inbox" title={empty ?? 'Nothing here.'} /></div>;
  return <>{children(q.data as T)}</>;
}

const TONES: Record<string, 'teal' | 'gold' | 'amber' | 'rose' | 'slate' | 'maroon'> = {
  APPROVED: 'teal', ACTIVE: 'teal', VERIFIED: 'teal', CONFIRMED: 'teal', MATCH_CONFIRMED: 'teal', RESOLVED: 'teal', COMPLETED: 'teal', ALLOWED: 'teal', ACCEPTED: 'teal',
  APPLIED: 'amber', UNDER_REVIEW: 'amber', IN_REVIEW: 'amber', PENDING: 'amber', NEEDS_INFO: 'amber', MORE_INFO: 'amber', AWAITING_CONSENT: 'amber', OPEN: 'amber', TRIAGED: 'amber', PENDING_CONTACT: 'amber', REQUESTED: 'amber', HIGH: 'amber', PROPOSED: 'amber',
  DECLINED: 'rose', FAILED: 'rose', SUSPENDED: 'rose', URGENT: 'rose', DENIED: 'rose', WITHDRAWN: 'rose', ESCALATED: 'rose', UNCONFIRMED: 'rose', REJECTED: 'rose',
};
export function S({ v }: { v?: string | null }) {
  if (!v) return <span className="muted">—</span>;
  const label = v.replace(/_/g, ' ').toLowerCase();
  return <Badge tone={TONES[v] ?? 'slate'}>{label[0].toUpperCase() + label.slice(1)}</Badge>;
}

/** Runs a staff action, surfaces errors, then invalidates the given query prefixes. */
export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (key: string, fn: () => Promise<unknown>, invalidate: string[] = []) => {
    setBusy(key); setError(null);
    try {
      await fn();
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      return true;
    } catch (e) { setError(e); return false; } finally { setBusy(null); }
  };
  return { busy, error, run, errorView: <ErrorNotice error={error} /> };
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist" style={{ marginBottom: 'var(--s4)' }}>
      {options.map((o) => <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
