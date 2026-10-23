import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Notice, Select, toE164 } from '@induru/shared';
import { adminApi, removeEvidenceObjects } from '../api';
import { Loadable, PageTitle, S, d, dt, useAction } from '../ui';

/** A10 — roles (super admin, MFA), service configuration, access review, data requests. */
export default function Settings({ isSuper }: { isSuper: boolean }) {
  const a = useAction();
  const roles = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles, enabled: isSuper });
  const config = useQuery({ queryKey: ['config'], queryFn: adminApi.config });
  const requests = useQuery({ queryKey: ['data-requests'], queryFn: adminApi.dataRequests });
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('verifier');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [purged, setPurged] = useState<string | null>(null);

  return (
    <>
      <PageTitle title="Roles & settings" />
      <div className="stack-lg">
        {isSuper ? (
          <section className="stack-sm">
            <h2>Staff access review</h2>
            <Loadable q={roles} empty="No staff.">
              {(rows) => (
                <div className="table-wrap"><table className="tbl">
                  <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Granted</th><th>By</th><th>Last activity</th><th /></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id}><td>{r.name ?? '—'}</td><td className="mono">••{r.phone_last4}</td><td><S v={r.role.toUpperCase()} /></td><td>{d(r.granted_at)}</td><td>{r.granted_by ?? 'bootstrap'}</td>
                      <td>{r.last_activity ? dt(r.last_activity) : <span className="muted">never</span>}</td>
                      <td><Button small variant="ghost" onClick={() => window.confirm('Revoke this role?') && void a.run('rev', () => adminApi.revokeRole(r.id), ['roles'])}>Revoke</Button></td></tr>
                  ))}</tbody></table></div>
              )}
            </Loadable>
            <div className="card row wrap" style={{ alignItems: 'flex-end' }}>
              <Field label="Phone (must have signed in once)">{(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
              <Field label="Role">{(p) => (
                <Select {...p} value={role} onChange={(e) => setRole(e.target.value)}>
                  {['verifier', 'broker', 'moderator', 'admin', 'super_admin'].map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>)}</Field>
              <Button loading={a.busy === 'grant'} disabled={!toE164(phone)}
                onClick={() => void a.run('grant', () => adminApi.grantRole(toE164(phone)!, role), ['roles'])}>Grant role</Button>
            </div>
            <p className="xsmall muted">Staff must enrol an authenticator app (MFA) on first sign-in. Review this list quarterly.</p>
          </section>
        ) : <Notice tone="neutral">Role management requires the super admin role.</Notice>}

        <section className="stack-sm">
          <h2>Service configuration</h2>
          <Loadable q={config}>
            {(cfg) => (
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Key</th><th>Value</th><th /></tr></thead>
                <tbody>{Object.entries(cfg).map(([k, v]) => (
                  <tr key={k}><td className="mono xsmall">{k}</td>
                    <td><Input aria-label={k} disabled={!isSuper} value={edits[k] ?? JSON.stringify(v)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} style={{ minHeight: 36, padding: '6px 10px' }} /></td>
                    <td>{isSuper && edits[k] !== undefined ? <Button small onClick={() => void a.run(`cfg-${k}`, async () => {
                      await adminApi.updateConfig(k, JSON.parse(edits[k]));
                      setEdits(({ [k]: _drop, ...rest }) => rest);
                    }, ['config'])}>Save</Button> : null}</td></tr>
                ))}</tbody></table></div>
            )}
          </Loadable>
        </section>

        <section className="stack-sm">
          <h2>Data requests (export / deletion)</h2>
          <Loadable q={requests} empty="No requests.">
            {(rows) => (
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Requested</th><th>By</th><th>Scope</th><th>Profile</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.id}><td>{d(r.requested_at)}</td><td>{r.requester}</td><td>{r.scope}</td><td className="mono">{r.candidate_code ?? '—'}</td><td><S v={r.status} /></td>
                    <td>{['REQUESTED', 'IN_PROGRESS'].includes(r.status) ? (
                      <div className="row">
                        <Button small variant="secondary" onClick={() => void a.run('dr', () => adminApi.updateDataRequest(r.id, 'IN_PROGRESS'), ['data-requests'])}>Start</Button>
                        <Button small onClick={() => void a.run('dr', () => adminApi.updateDataRequest(r.id, 'COMPLETED', window.prompt('Legal exceptions retained (if any)') ?? undefined), ['data-requests'])}>Complete</Button>
                      </div>) : r.exceptions ? <span className="xsmall muted">{r.exceptions}</span> : null}</td></tr>
                ))}</tbody></table></div>
            )}
          </Loadable>
        </section>

        <section className="card stack-sm">
          <h2>Evidence retention</h2>
          <p className="small muted">Marks expired verification documents as deleted and removes the files from storage.</p>
          <Button variant="secondary" loading={a.busy === 'purge'} onClick={() => void a.run('purge', async () => {
            const paths = await adminApi.purgeEvidence();
            await removeEvidenceObjects(paths);
            setPurged(`${paths.length} document(s) marked for deletion.`);
          }, ['overview'])}>Purge expired evidence</Button>
          {purged ? <Notice tone="success">{purged}</Notice> : null}
        </section>
        {a.errorView}
      </div>
    </>
  );
}
