import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  refreshSession,
  setAccessToken,
  subscribeToSession,
  type SessionPayload,
  type User,
} from '@/lib/api-client';

type AuthState = { status: 'loading'; user: null } | { status: 'authenticated'; user: User } | { status: 'anonymous'; user: null };

interface AuthContextValue {
  state: AuthState;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const applySession = useCallback((session: SessionPayload | null) => {
    if (session) {
      setAccessToken(session.accessToken);
      setState({ status: 'authenticated', user: session.user });
    } else {
      setAccessToken(null);
      setState({ status: 'anonymous', user: null });
      queryClient.clear();
    }
  }, [queryClient]);

  // On page load the in-memory access token is gone; the httpOnly refresh cookie
  // (if present) silently restores the session.
  useEffect(() => {
    const unsubscribe = subscribeToSession(applySession);
    void refreshSession();
    return unsubscribe;
  }, [applySession]);

  const endSession = useCallback(() => {
    applySession(null);
    queryClient.clear();
  }, [applySession, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (input) => applySession(await api.post<SessionPayload>('/auth/login', input)),
      register: async (input) => applySession(await api.post<SessionPayload>('/auth/register', input)),
      logout: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        endSession();
      },
      logoutEverywhere: async () => {
        await api.post('/auth/logout-all');
        endSession();
      },
      setUser: (user) => setState({ status: 'authenticated', user }),
    }),
    [state, applySession, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** For components rendered only inside the protected area. */
export function useCurrentUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser used outside an authenticated route');
  return state.user;
}
