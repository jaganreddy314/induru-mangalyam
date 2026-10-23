import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Notice } from '@induru/shared';

/** Shows a one-time invitation link with native share (WhatsApp/SMS) and copy. */
export function InviteLink({ link, shareText, note }: { link: string; shareText: string; note: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); return; } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };
  return (
    <div className="stack-sm">
      <Notice tone="success" icon="check">{note}</Notice>
      <code className="card xsmall" style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace' }}>{link}</code>
      <div className="grid-2">
        <Button variant="secondary" small onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
          <Icon name="clipboard" size={17} />{copied ? t('common.copied') : t('common.copyLink')}
        </Button>
        <Button small onClick={() => void share()}>{t('common.share')}</Button>
      </div>
    </div>
  );
}
