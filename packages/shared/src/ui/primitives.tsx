import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';
import { illustrations, type IllustrationName } from '../assets';
import { ApiError } from '../api';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-fill' | 'teal';

export function Button({ variant = 'primary', block, small, loading, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean; small?: boolean; loading?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''} ${className}`}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label + control + hint + inline error, wired for screen readers. */
export function Field({ label, hint, error, optional, required, children }: FieldProps) {
  const id = useId();
  const { t } = useTranslation();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="req" aria-hidden="true"> *</span> : null}
        {optional ? <span className="muted" style={{ fontWeight: 400 }}> ({t('common.optional')})</span> : null}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {error ? (
        <p id={`${id}-err`} className="field-error" role="alert"><Icon name="circleAlert" size={15} />{error}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...rest }, ref) => <input ref={ref} className={`input ${className}`} {...rest} />,
);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...rest }, ref) => <select ref={ref} className={`select ${className}`} {...rest} />,
);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...rest }, ref) => <textarea ref={ref} className={`textarea ${className}`} {...rest} />,
);

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span className="box"><Icon name="check" size={15} strokeWidth={3} /></span>
      <span className="stack-sm" style={{ gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Row inside an .opt-list card: title + sub on the left, 48×28 toggle on the right. */
export function ToggleRow({ title, sub, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'title'> & { title: ReactNode; sub?: ReactNode }) {
  return (
    <label className={`opt${rest.disabled ? ' disabled' : ''}`}>
      <span className="grow"><span className="opt-title" style={{ display: 'block' }}>{title}</span>{sub ? <span className="opt-sub">{sub}</span> : null}</span>
      <span className="toggle"><input type="checkbox" role="switch" {...rest} /><span /></span>
    </label>
  );
}

/** Radio or checkbox row inside an .opt-list card — filled dot/check plus label, never colour alone. */
export function OptionRow({ type = 'radio', title, sub, right, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'title'> & { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <label className={`opt${rest.disabled ? ' disabled' : ''}`}>
      <input type={type} {...rest} />
      {type === 'radio' ? <span className="dot-radio" /> : <span className="box" style={{ marginTop: 0 }}><Icon name="check" size={14} strokeWidth={3} /></span>}
      <span className="grow">
        <span style={{ display: 'block', fontWeight: sub ? 600 : 400 }}>{title}</span>
        {sub ? <span className="opt-sub">{sub}</span> : null}
      </span>
      {right}
    </label>
  );
}

/** Small square tick + label (capability lists). */
export function Tick({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="tick">
      <input type="checkbox" {...rest} />
      <span className="box" style={{ marginTop: 0 }}><Icon name="check" size={14} strokeWidth={3} /></span>
      <span>{label}</span>
    </label>
  );
}

/** 3px segmented progress bar + optional "Step n of N" kicker. */
export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}
    </div>
  );
}

export type TimelineState = 'done' | 'current' | 'pending' | 'future';
/** Vertical timeline: done = green check, current = maroon ring, pending = amber ring, future = grey outline. */
export function Timeline({ items, large }: { items: { state: TimelineState; title: ReactNode; sub?: ReactNode; children?: ReactNode }[]; large?: boolean }) {
  return (
    <ol className={`tl${large ? ' tl-lg' : ''}`}>
      {items.map((it, i) => (
        <li key={i} className={it.state} aria-current={it.state === 'current' || it.state === 'pending' ? 'step' : undefined}>
          <div className="rail">
            <span className="node">{it.state === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
            <span className="line" />
          </div>
          <div className="body">
            <div className="title">{it.title}</div>
            {it.sub ? <div className="sub">{it.sub}</div> : null}
            {it.children}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Badge({ tone = 'slate', icon, children }: { tone?: 'teal' | 'gold' | 'amber' | 'rose' | 'slate' | 'maroon'; icon?: IconName; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{icon ? <Icon name={icon} size={12} /> : null}{children}</span>;
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'success' | 'error' | 'neutral'; icon?: IconName; children: ReactNode }) {
  const fallback: IconName = tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'info';
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon ?? fallback} size={18} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  return (
    <Notice tone="error">
      <div className="row-between wrap">
        <span>{t(`errors.${code}`)}</span>
        {onRetry ? <Button variant="ghost" small onClick={onRetry}>{t('common.retry')}</Button> : null}
      </div>
    </Notice>
  );
}

export function EmptyState({ icon = 'turmericLeaf', title, children, illustration }: { icon?: IconName; title: ReactNode; children?: ReactNode; illustration?: IllustrationName }) {
  return (
    <div className="empty">
      {illustration ? <img src={illustrations[illustration]} alt="" aria-hidden="true" className="illustration illustration-sm" /> : <Icon name={icon} size={32} />}
      <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
      {children}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div className="stack" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card row" style={{ alignItems: 'flex-start', gap: 14 }}>
          <Skeleton height={104} width={84} style={{ borderRadius: 10 }} />
          <div className="grow stack-sm" style={{ paddingTop: 4 }}><Skeleton width={60} height={10} /><Skeleton width={140} height={16} /><Skeleton width={110} height={12} /></div>
        </div>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on wider screens. Escape closes; focus moves in. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} ref={ref}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="row-between">
          {title ? <h2>{title}</h2> : <span />}
          <button type="button" className="icon-btn" style={{ marginRight: -12 }} onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ label, src, large, small, locked }: { label: string; src?: string | null; large?: boolean; small?: boolean; locked?: boolean }) {
  return (
    <div className={`avatar${large ? ' avatar-lg' : ''}${small ? ' avatar-sm' : ''}${locked ? ' avatar-lock' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : locked ? <Icon name="lock" size={17} /> : label.replace(/^IM-/, '').slice(0, 1).toUpperCase()}
    </div>
  );
}
