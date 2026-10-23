import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, Progress, type IconName } from '@induru/shared';
import { HeaderArcs } from './Ornament';

/** In-page header. With `back`, a 44px arrow sits above the title (detail screens). */
export function PageHeader({ title, back, action, subtitle, kicker }: { title: ReactNode; back?: boolean | string; action?: ReactNode; subtitle?: ReactNode; kicker?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="stack-sm">
      {back ? (
        <button type="button" className="icon-btn" style={{ marginLeft: -12, marginTop: -8 }} aria-label={t('common.back')}
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
          <Icon name="arrowLeft" />
        </button>
      ) : null}
      {kicker ? <div className="kicker">{kicker}</div> : null}
      <div className="page-head">
        <h1>{title}</h1>
        {action}
      </div>
      {subtitle ? <p className="muted small" style={{ lineHeight: 1.55 }}>{subtitle}</p> : null}
    </div>
  );
}

/** Top bar with a single leading icon button and optional title / trailing actions (M09, M11, M13, M17–M19). */
export function TopBar({ icon = 'arrowLeft', onLead, title, right }: { icon?: IconName; onLead?: () => void; title?: ReactNode; right?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="topbar">
      <span className="topbar-title">
        <button type="button" className="icon-btn" onClick={onLead ?? (() => navigate(-1))} aria-label={icon === 'x' ? t('common.close') : t('common.back')}>
          <Icon name={icon} />
        </button>
        {title}
      </span>
      {right ? <span className="row" style={{ gap: 0 }}>{right}</span> : null}
    </div>
  );
}

/** Sandal step header with field-row arcs (M04): back · trailing action, "Step n of N", title, 3px progress. */
export function StepHeader({ step, total, title, onBack, trailing }: { step: number; total: number; title: ReactNode; onBack?: () => void; trailing?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="sandal-head">
      <HeaderArcs />
      <div className="inner">
        <div className="row-between" style={{ marginBottom: 10, minHeight: 44 }}>
          {onBack ? <button type="button" className="icon-btn" style={{ marginLeft: -12 }} onClick={onBack} aria-label={t('common.back')}><Icon name="arrowLeft" /></button> : <span />}
          {trailing}
        </div>
        <div className="kicker">{t('apply.subtitle', { step, total })}</div>
        <h1 style={{ fontSize: 28, margin: '4px 0 14px' }}>{title}</h1>
        <Progress step={step} total={total} />
      </div>
    </header>
  );
}
