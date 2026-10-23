import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardSkeleton, EmptyState, ErrorNotice, Field, Icon, Input, Select, Sheet, type DiscoverFilters, type Gender, type PublicCard } from '@induru/shared';
import { api, qk } from '../lib/api';
import { ProfileCard } from '../components/ProfileCard';
import { DISTRICTS } from '../lib/constants';

const FILTER_KEY = 'im.discover.filters';
function loadFilters(): DiscoverFilters {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') as DiscoverFilters; } catch { return {}; }
}

/** M12 — approved, opted-in profiles only (I1); photo slot is a lock panel or monogram; skeleton card for
 *  cursor pagination. */
export default function Discover() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<DiscoverFilters>(loadFilters);
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [open, setOpen] = useState(false);

  const q = useInfiniteQuery({
    queryKey: qk.discover(filters),
    queryFn: ({ pageParam }) => api.discover(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const commit = (f: DiscoverFilters) => {
    const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v != null)) as DiscoverFilters;
    setFilters(clean);
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  };
  const apply = () => { commit(draft); setOpen(false); };
  const toggleSave = async (c: PublicCard) => {
    if (c.shortlisted) await api.removeShortlist(c.code); else await api.saveShortlist(c.code);
    await Promise.all([qc.invalidateQueries({ queryKey: ['discover'] }), qc.invalidateQueries({ queryKey: qk.shortlist })]);
  };

  const chips: { key: keyof DiscoverFilters | 'age'; label: string }[] = [];
  if (filters.gender) chips.push({ key: 'gender', label: filters.gender === 'FEMALE' ? t('discover.bride') : t('discover.groom') });
  if (filters.age_min || filters.age_max) chips.push({ key: 'age', label: `${t('discover.ageRange')} ${filters.age_min ?? 18}–${filters.age_max ?? ''}` });
  for (const k of ['district', 'city', 'profession', 'education'] as const) if (filters[k]) chips.push({ key: k, label: String(filters[k]) });
  const removeChip = (key: (typeof chips)[number]['key']) => {
    const next = { ...filters };
    if (key === 'age') { delete next.age_min; delete next.age_max; } else delete next[key];
    commit(next);
  };
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page" style={{ paddingTop: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h1>{t('discover.title')}</h1>
          <Link to="/shortlist" className="pill-select" style={{ textDecoration: 'none' }}><Icon name="bookmark" size={14} />{t('discover.shortlist')}</Link>
        </div>
        <div className="chips">
          <button type="button" className="chip chip-outline" onClick={() => { setDraft(filters); setOpen(true); }}>
            <Icon name="sliders" size={15} />{t('discover.filters')}{chips.length ? ` · ${chips.length}` : ''}
          </button>
          {chips.map((c) => (
            <button key={c.key} type="button" className="chip" onClick={() => removeChip(c.key)} aria-label={`${c.label} — ${t('common.remove')}`}>
              {c.label}<Icon name="x" size={13} />
            </button>
          ))}
        </div>
      </div>

      <div className="page stack-sm" style={{ paddingTop: 14, gap: 12 }}>
        <p className="xsmall muted">{t('discover.privacyNote')}</p>
        {q.isLoading ? <CardSkeleton count={3} /> : q.error ? <ErrorNotice error={q.error} onRetry={() => void q.refetch()} /> : items.length ? (
          <>
            {items.map((c) => (
              <ProfileCard key={c.code} card={c} to={`/p/${c.code}`} action={
                <button type="button" className="bookmark-btn" aria-pressed={!!c.shortlisted} aria-label={c.shortlisted ? t('profile.shortlisted') : t('profile.shortlist')}
                  onClick={(e) => { e.preventDefault(); void toggleSave(c); }}>
                  <Icon name={c.shortlisted ? 'bookmarkCheck' : 'bookmark'} size={19} />
                </button>
              } />
            ))}
            {q.isFetchingNextPage ? <CardSkeleton count={1} /> : q.hasNextPage ? (
              <Button variant="secondary" onClick={() => void q.fetchNextPage()}>{t('common.loadMore')}</Button>
            ) : <p className="center muted xsmall" style={{ padding: 8 }}>{t('discover.endOfList')}</p>}
          </>
        ) : (
          <EmptyState illustration="emptyMatches" title={t('discover.empty')}>
            {chips.length ? <Button variant="secondary" small onClick={() => commit({})}>{t('discover.clearFilters')}</Button> : null}
          </EmptyState>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('discover.filters')}>
        <div className="field">
          <span className="label" id="look-l">{t('discover.looking')}</span>
          <div className="segmented" role="group" aria-labelledby="look-l">
            {([undefined, 'FEMALE', 'MALE'] as (Gender | undefined)[]).map((g) => (
              <button key={g ?? 'any'} type="button" aria-pressed={draft.gender === g} onClick={() => setDraft({ ...draft, gender: g })}>
                {g === 'FEMALE' ? t('discover.bride') : g === 'MALE' ? t('discover.groom') : t('discover.anyGender')}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <Field label={t('candidate.ageMin')}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={18} max={80} value={draft.age_min ?? ''} onChange={(e) => setDraft({ ...draft, age_min: e.target.value ? Number(e.target.value) : undefined })} />}
          </Field>
          <Field label={t('candidate.ageMax')}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={18} max={80} value={draft.age_max ?? ''} onChange={(e) => setDraft({ ...draft, age_max: e.target.value ? Number(e.target.value) : undefined })} />}
          </Field>
        </div>
        <Field label={t('candidate.district')}>
          {(p) => (
            <Select {...p} value={draft.district ?? ''} onChange={(e) => setDraft({ ...draft, district: e.target.value || undefined })}>
              <option value="">{t('discover.anyGender')}</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('candidate.city')}>{(p) => <Input {...p} value={draft.city ?? ''} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />}</Field>
        <Field label={t('candidate.profession')}>{(p) => <Input {...p} value={draft.profession ?? ''} onChange={(e) => setDraft({ ...draft, profession: e.target.value })} />}</Field>
        <Field label={t('candidate.education')}>{(p) => <Input {...p} value={draft.education ?? ''} onChange={(e) => setDraft({ ...draft, education: e.target.value })} />}</Field>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <Button variant="secondary" onClick={() => setDraft({})}>{t('discover.clearFilters')}</Button>
          <Button onClick={apply}>{t('discover.applyFilters')}</Button>
        </div>
      </Sheet>
    </div>
  );
}
