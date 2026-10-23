import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CardSkeleton, ErrorNotice } from '@induru/shared';
import { useSession } from './session';
import { AppShell, BareShell } from './Layout';
import { pendingInviteToken, rememberInviteToken } from '../lib/invite';
import Welcome from '../pages/Welcome';
import Login from '../pages/Login';
import LanguagePage from '../pages/Language';

const Apply = lazy(() => import('../pages/Apply'));
const Status = lazy(() => import('../pages/Status'));
const Join = lazy(() => import('../pages/Join'));
const Home = lazy(() => import('../pages/Home'));
const Discover = lazy(() => import('../pages/Discover'));
const Profile = lazy(() => import('../pages/Profile'));
const Shortlist = lazy(() => import('../pages/Shortlist'));
const Interests = lazy(() => import('../pages/Interests'));
const Introductions = lazy(() => import('../pages/Introductions'));
const Introduction = lazy(() => import('../pages/Introduction'));
const Family = lazy(() => import('../pages/Family'));
const CandidateNew = lazy(() => import('../pages/CandidateNew'));
const CandidateEdit = lazy(() => import('../pages/CandidateEdit'));
const CandidateInvite = lazy(() => import('../pages/CandidateInvite'));
const Consent = lazy(() => import('../pages/Consent'));
const Privacy = lazy(() => import('../pages/Privacy'));
const MyProfile = lazy(() => import('../pages/MyProfile'));
const Notifications = lazy(() => import('../pages/Notifications'));
const Settings = lazy(() => import('../pages/Settings'));
const Help = lazy(() => import('../pages/Help'));

function Loading() {
  return <div className="page"><CardSkeleton count={3} /></div>;
}

/** Signed in + profile loaded. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { authReady, authSession, state, stateError, refresh } = useSession();
  const location = useLocation();
  const inviteToken = location.pathname === '/join' ? new URLSearchParams(location.search).get('t') : null;
  if (inviteToken) rememberInviteToken(inviteToken);
  if (!authReady) return <Loading />;
  if (!authSession) return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  if (stateError) return <div className="page"><ErrorNotice error={stateError} onRetry={() => void refresh()} /></div>;
  if (!state) return <Loading />;
  return <>{children}</>;
}

/** No member tabs before membership approval (PRD §3). */
function RequireApproved({ children }: { children: ReactNode }) {
  const { state } = useSession();
  if (!state?.membership) {
    const token = pendingInviteToken();
    return <Navigate to={token ? `/join?t=${encodeURIComponent(token)}` : '/apply'} replace />;
  }
  if (state.membership.status !== 'APPROVED') return <Navigate to="/status" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/language" element={<LanguagePage />} />
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth><BareShell /></RequireAuth>}>
          <Route path="/join" element={<Join />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/status" element={<Status />} />
          <Route path="/help-pending" element={<Help />} />
        </Route>

        <Route element={<RequireAuth><RequireApproved><AppShell /></RequireApproved></RequireAuth>}>
          <Route index element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/p/:code" element={<Profile />} />
          <Route path="/shortlist" element={<Shortlist />} />
          <Route path="/interests" element={<Interests />} />
          <Route path="/requests" element={<Interests />} />
          <Route path="/introductions" element={<Introductions />} />
          <Route path="/introductions/:id" element={<Introduction />} />
          <Route path="/family" element={<Family />} />
          <Route path="/candidates/new" element={<CandidateNew />} />
          <Route path="/candidates/:id" element={<CandidateEdit />} />
          <Route path="/candidates/:id/invite" element={<CandidateInvite />} />
          <Route path="/candidates/:id/consent" element={<Consent />} />
          <Route path="/candidates/:id/privacy" element={<Privacy />} />
          <Route path="/me" element={<MyProfile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
