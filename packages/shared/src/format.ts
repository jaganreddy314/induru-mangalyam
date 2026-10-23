import type { Locale } from './types';

const tag = (l: Locale) => (l === 'te' ? 'te-IN' : 'en-IN');

export function fmtDate(iso: string | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(tag(locale), opts).format(new Date(iso));
}

export function fmtDateTime(iso: string, locale: Locale, timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function fmtRelative(iso: string, locale: Locale) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(iso, locale);
}

/** Masks all but the last 4 digits, e.g. +91 ••••• •3210 */
export function maskPhone(phone: string) {
  return phone.replace(/\d(?=\d{4})/g, '•');
}
