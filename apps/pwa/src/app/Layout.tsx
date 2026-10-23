import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, Icon, Notice, type IconName } from '@induru/shared';
import { isCandidateUser, useMe, useSession } from './session';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function UpdatePrompt() {
  const { t } = useTranslation();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-banner">
      <Notice tone="neutral" icon="sparkle">
        <div className="row-between">
          <span>{t('common.updateAvailable')}</span>
          <Button small onClick={() => void updateServiceWorker(true)}>{t('common.continue')}</Button>
        </div>
      </Notice>
    </div>
  );
}

/** Bell with unread dot (M07 header). */
export function BellLink() {
  const { t } = useTranslation();
  const { state } = useSession();
  const unread = state?.unread_notifications ?? 0;
  return (
    <Link to="/notifications" className="icon-btn icon-btn-ring" aria-label={`${t('notifications.title')}${unread ? ` (${unread})` : ''}`}>
      <Icon name="bell" size={20} />
      {unread ? <span className="dot" aria-hidden="true" /> : null}
    </Link>
  );
}

const familyNav: { to: string; icon: IconName; key: 'home' | 'discover' | 'interests' | 'introductions' | 'family' }[] = [
  { to: '/', icon: 'home', key: 'home' },
  { to: '/discover', icon: 'compass', key: 'discover' },
  { to: '/interests', icon: 'inbox', key: 'interests' },
  { to: '/introductions', icon: 'handshake', key: 'introductions' },
  { to: '/family', icon: 'users', key: 'family' },
];
const candidateNav: { to: string; icon: IconName; key: 'home' | 'requests' | 'introductions' | 'myProfile' }[] = [
  { to: '/', icon: 'home', key: 'home' },
  { to: '/requests', icon: 'inbox', key: 'requests' },
  { to: '/introductions', icon: 'handshake', key: 'introductions' },
  { to: '/me', icon: 'circleUser', key: 'myProfile' },
];

export function AppShell() {
  const { t } = useTranslation();
  const me = useMe();
  const online = useOnline();
  const location = useLocation();
  const nav = isCandidateUser(me) ? candidateNav : familyNav;
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return (
    <div className="shell">
      {!online ? <div className="page" style={{ paddingBottom: 0 }}><Notice tone="neutral">{t('common.offline')}</Notice></div> : null}
      <main className="main" id="main"><Outlet /></main>
      <nav className="bottom-nav" aria-label="Primary">
        <ul>
          {nav.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={n.icon} size={22} />
                <span>{t(`nav.${n.key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <UpdatePrompt />
    </div>
  );
}

/** Pre-approval screens: no tabs. */
export function BareShell() {
  return (
    <div className="shell">
      <main className="main main-nonav"><Outlet /></main>
    </div>
  );
}
