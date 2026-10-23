import { Icon } from './Icon';

export interface TesterAccount { phone: string; label: string }

/** Local-development helper listing the fictitious seed accounts. Callers render it only when
 *  `import.meta.env.DEV` is true, so it is stripped from production builds. */
export function TesterAccounts({ accounts, onPick, code = '123456' }: { accounts: TesterAccount[]; onPick: (phone: string) => void; code?: string }) {
  return (
    <details className="card" style={{ padding: '12px 16px', background: 'var(--warn-bg)', borderColor: 'var(--warn-border)' }}>
      <summary className="row" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--warn-ink)', gap: 8 }}>
        <Icon name="key" size={16} />Tester accounts · code {code}
      </summary>
      <div className="stack-sm" style={{ marginTop: 10, gap: 4 }}>
        {accounts.map((a) => (
          <button key={a.phone} type="button" onClick={() => onPick(a.phone)} className="row-between"
            style={{ background: 'none', border: 0, borderTop: '1px solid var(--warn-border)', padding: '8px 0', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
            <span>{a.label}</span><span className="num muted">{a.phone}</span>
          </button>
        ))}
        <p className="xsmall muted" style={{ marginTop: 6 }}>Fictitious demo data, local development only. Any new number also works with the same code.</p>
      </div>
    </details>
  );
}
