import type { NotificationItem } from '@induru/shared';

/** Deep link for a notification, from its opaque payload only. */
export function notificationLink(n: NotificationItem): string {
  const p = n.payload;
  if (p.introduction_id) return `/introductions/${p.introduction_id}`;
  if (p.match_id) return n.template_key === 'interest.confirm_needed' ? '/interests?box=SENT' : '/interests';
  if (p.candidate_id) return `/candidates/${p.candidate_id}`;
  if (p.case_id) return '/help';
  return '/notifications';
}

export function notificationKey(templateKey: string) {
  return `notif.${templateKey.replace('.', '_')}` as const;
}
