import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, setLocale, storedLocale, type SessionState } from '@induru/shared';
import { api, qk } from '../lib/api';

interface SessionCtx {
  authSession: Session | null;
  authReady: boolean;
  state: SessionState | undefined;
  stateLoading: boolean;
  stateError: unknown;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const qc = useQueryClient();
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      if (!session) qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, qc]);

  const userId = authSession?.user.id;
  const stateQuery = useQuery({
    queryKey: [...qk.session, userId],
    enabled: !!userId,
    queryFn: async () => {
      const s = await api.ensureProfile(storedLocale() ?? undefined);
      if (!storedLocale()) setLocale(s.user.locale);
      return s;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: qk.session }), [qc]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [supabase, qc]);

  const value = useMemo<SessionCtx>(() => ({
    authSession, authReady,
    state: stateQuery.data, stateLoading: stateQuery.isLoading, stateError: stateQuery.error,
    refresh, signOut,
  }), [authSession, authReady, stateQuery.data, stateQuery.isLoading, stateQuery.error, refresh, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** Signed-in, profile-loaded state. Only use under the authenticated route guard. */
export function useMe(): SessionState {
  const { state } = useSession();
  if (!state) throw new Error('useMe before session state loaded');
  return state;
}

export function isCandidateUser(state: SessionState) {
  return state.membership?.relation === 'CANDIDATE';
}
