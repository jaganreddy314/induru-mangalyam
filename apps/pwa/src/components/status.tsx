import { useTranslation } from 'react-i18next';
import { Badge, type CandidateStatus, type IntroStage } from '@induru/shared';

export function CandidateStatusBadge({ status, suspended }: { status: CandidateStatus; suspended?: boolean }) {
  const { t } = useTranslation();
  if (suspended) return <Badge tone="rose">{t('candidateStatus.SUSPENDED')}</Badge>;
  const tone = status === 'ACTIVE' ? 'teal' : status === 'UNDER_REVIEW' || status === 'AWAITING_CONSENT' ? 'amber' : status === 'WITHDRAWN' ? 'rose' : 'slate';
  return <Badge tone={tone}>{t(`candidateStatus.${status}`)}</Badge>;
}

export function StageBadge({ stage }: { stage: IntroStage }) {
  const { t } = useTranslation();
  const tone = stage === 'MATCH_CONFIRMED' ? 'teal' : stage === 'CLOSED' ? 'slate' : stage === 'PENDING_CONTACT' ? 'amber' : 'maroon';
  return <Badge tone={tone}>{t(`intro.stage.${stage}`)}</Badge>;
}
