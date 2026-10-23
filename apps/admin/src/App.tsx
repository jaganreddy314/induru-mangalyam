import { lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton, Icon, Mark, getSupabase, type IconName, type SessionState, type StaffRole } from '@induru/shared';
import { adminApi } from './api';
import { StaffContext } from './ui';

const Overview = lazy(() => import('./pages/Overview'));
const Membership = lazy(() => import('./pages/Membership'));
const FamilyDetail = lazy(() => import('./pages/FamilyDetail'));
const Candidates = lazy(() => import('./pages/Candidates'));
const CandidateReview = lazy(() => import('./pages/CandidateReview'));
const Verification = lazy(() => import('./pages/Verification'));
const Matchmaking = lazy(() => import('./pages/Matchmaking'));
const Introductions = lazy(() => import('./pages/Introductions'));
const IntroductionDetail = lazy(() => import('./pages/IntroductionDetail'));
const Support = lazy(() => import('./pages/Support'));
const Audit = lazy(() => import('./pages/Audit'));
const Settings = lazy(() => import('./pages/Settings'));

const NAV: { to: string; label: string; icon: IconName; roles: StaffRole[]; count?: string; urgent?: string }[] = [
  { to: '/', label: 'Overview', icon: 'dashboard', roles: ['verifier', 'broker', 'moderator', 'admin'] },
  { to: '/membership', label: 'Membership', icon: 'userPlus', roles: ['verifier', 'admin'], count: 'membership_pending' },
  { to: '/families', label: 'Families', icon: 'home', roles: ['verifier', 'admin', 'moderator'] },
  { to: '/candidates', label: 'Candidates', icon: 'contact', roles: ['verifier', 'admin', 'moderator'] },
  { to: '/verification', label: 'Verification', icon: 'shieldCheck', roles: ['verifier', 'admin'], count: 'candidates_in_review' },
  { to: '/matchmaking', label: 'Matchmaking', icon: 'search', roles: ['broker', 'admin'] },
  { to: '/introductions', label: 'Introductions', icon: 'handshake', roles: ['broker', 'admin'], count: 'introductions_open' },
  { to: '/support', label: 'Support', icon: 'lifeBuoy', roles: ['moderator', 'admin'], count: 'reports_open', urgent: 'reports_urgent' },
  { to: '/audit', label: 'Audit', icon: 'scroll', roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: 'settings', roles: ['admin'] },
];
const ROLE_LABEL: Record<StaffRole, string> = { super_admin: 'Super admin', admin: 'Admin', verifier: 'Verifier', broker: 'Broker', moderator: 'Moderator' };

export function App({ state }: { state: SessionState }) {
  const roles = state.staff_roles;
  const can = (r: StaffRole[]) => roles.includes('super_admin') || r.some((x) => roles.includes(x));
  const counts = useQuery({ queryKey: ['overview'], queryFn: adminApi.overview, refetchInterval: 60_000 }).data ?? {};
  const name = state.user.display_name ?? state.user.phone ?? 'Staff';
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const topRole = (['super_admin', 'admin', 'verifier', 'broker', 'moderator'] as StaffRole[]).find((r) => roles.includes(r));
  return (
    <StaffContext.Provider value={{ id: state.user.id, name, roles }}>
    <div className="admin">
      <aside className="sidebar">
        <Link to="/" className="brand"><Mark size={30} width={2.4} stem={false} /><span><b>Induru Mangalyam</b><small>CONSOLE</small></span></Link>
        <nav aria-label="Admin">
          {NAV.filter((n) => can(n.roles)).map((n) => {
            const urgent = n.urgent ? counts[n.urgent] ?? 0 : 0;
            const count = n.count ? counts[n.count] ?? 0 : 0;
            return (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={n.icon} size={17} />{n.label}
                {urgent ? <span className="count urgent" aria-label={`${urgent} urgent`}>{urgent}</span> : count ? <span className="count">{count}</span> : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="who">
          <span className="avatar">{initials}</span>
          <div className="grow"><div style={{ fontWeight: 600 }}>{name}</div><div className="muted">{topRole ? ROLE_LABEL[topRole] : 'Staff'} · MFA on</div></div>
          <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Sign out" onClick={() => void getSupabase().auth.signOut()}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>
      <main className="content">
        <Suspense fallback={<CardSkeleton count={4} />}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="/membership" element={<Membership defaultStatus="" />} />
            <Route path="/families" element={<Membership defaultStatus="APPROVED" />} />
            <Route path="/families/:id" element={<FamilyDetail />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/candidates/:id" element={<CandidateReview />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/matchmaking" element={<Matchmaking />} />
            <Route path="/introductions" element={<Introductions />} />
            <Route path="/introductions/:id" element={<IntroductionDetail me={state.user.id} />} />
            <Route path="/support" element={<Support />} />
            <Route path="/support/:id" element={<Support />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<Settings isSuper={roles.includes('super_admin')} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
    </StaffContext.Provider>
  );
}
