import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, ErrorNotice, Field, Input, Notice, Select, Textarea, fmtDate, type Locale, type ReportCategory } from '@induru/shared';
import { api, qk } from '../lib/api';
import { useSession } from '../app/session';
import { PageHeader } from '../components/Page';

const CATS: ReportCategory[] = ['PRESSURE', 'IMPERSONATION', 'HARASSMENT', 'DATA_MISUSE', 'FALSE_CLAIMS', 'OTHER'];

/** M22 — confidential reporting, urgent self-pause, case tracking. */
export default function Help() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { state, refresh } = useSession();
  const reports = useQuery({ queryKey: qk.reports, queryFn: api.myReports });
  const [category, setCategory] = useState<ReportCategory>('PRESSURE');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pauseMe, setPauseMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [sentRef, setSentRef] = useState<string | null>(null);

  const submit = async () => {
    if (description.trim().length < 10) return;
    setBusy(true); setErr(null);
    try {
      const id = await api.fileReport({ category, description: description.trim(), relatedCode: code.trim() || undefined,
        introduction: params.get('intro') ?? undefined, urgent, pauseMe });
      setSentRef(id.slice(0, 8).toUpperCase());
      setDescription('');
      await Promise.all([qc.invalidateQueries({ queryKey: qk.reports }), refresh()]);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="page stack-lg">
      <PageHeader title={t('help.title')} back subtitle={t('help.intro')} />
      <Notice tone="error" icon="phone"><strong>{t('help.urgent')}</strong></Notice>

      {sentRef ? <Notice tone="success">{t('help.sent', { ref: sentRef })}</Notice> : null}
      <section className="stack">
        <Field label={t('help.category')}>
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
              {CATS.map((c) => <option key={c} value={c}>{t(`help.categories.${c}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('help.profileCode')} optional>
          {(p) => <Input {...p} className="num" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="IM-XXXXXXX" />}
        </Field>
        <Field label={t('help.description')} hint="≥ 10">
          {(p) => <Textarea {...p} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Checkbox label={t('help.urgentFlag')} checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        {state?.own_candidate ? <Checkbox label={t('help.pauseMe')} checked={pauseMe} onChange={(e) => setPauseMe(e.target.checked)} /> : null}
        <ErrorNotice error={err} />
        <Button block onClick={() => void submit()} loading={busy} disabled={description.trim().length < 10}>{t('help.send')}</Button>
      </section>

      <section className="stack-sm">
        <h2>{t('help.myReports')}</h2>
        <div className="card card-flush list">
          {(reports.data ?? []).map((r) => (
            <div key={r.id} className="list-item">
              <span className="grow small">{t(`help.categories.${r.category}`)}<br /><span className="xsmall muted mono">{r.id.slice(0, 8).toUpperCase()} · {fmtDate(r.created_at, i18n.language as Locale)}</span></span>
              <Badge tone={r.status === 'RESOLVED' || r.status === 'CLOSED' ? 'teal' : 'amber'}>{t(`help.reportStatus.${r.status}`)}</Badge>
            </div>
          ))}
          {reports.data && !reports.data.length ? <p className="muted small list-item">{t('help.noReports')}</p> : null}
        </div>
      </section>
    </div>
  );
}
