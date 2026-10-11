import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  getStoredToken,
  isSessionPersistenceAvailable,
  setStoredToken,
  setUnauthorizedHandler,
} from '@/api/client';
import type { AuthUser } from '@/api/types';

/**
 * Authentication state for the whole app.
 *
 * The token lives in memory for the life of the page and is mirrored to localStorage when
 * the browser allows it, so a refresh keeps the session. The current user is re-fetched from
 * `GET /api/auth/me` on boot. The server is the authority on identity: the client never
 * trusts a cached role for anything security-relevant — it only uses it to decide which
 * navigation to render. Every protected API call is authorised server-side.
 *
 * Two failure modes are handled explicitly:
 *   - the API rejects a request as unauthenticated → the session is dropped here and the
 *     router sends the visitor to `/login` (see `setUnauthorizedHandler`);
 *   - `/auth/me` cannot be reached at all (API down, offline) → the token is *kept*, so the
 *     session is not destroyed by a transient outage.
 */

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  /** True while the initial session restore is in flight. */
  initializing: boolean;
  /** Set when the session ended on its own (expired token), so the login screen can explain. */
  sessionNotice: string | null;
  /** True when the browser blocked Web Storage, so the session cannot survive a reload. */
  canPersistSession: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  updateProfile: (payload: Record<string, unknown>) => Promise<AuthUser>;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [initializing, setInitializing] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [canPersistSession, setCanPersistSession] = useState(() => isSessionPersistenceAvailable());

  /** Ends the session locally: no token, no user, and a reason for the login screen. */
  const endSession = useCallback((notice: string | null) => {
    setStoredToken(null);
    setToken(null);
    setUserState(null);
    setSessionNotice(notice);
  }, []);

  // The API client reports any request it had to reject as unauthenticated. Reacting here
  // (rather than in each screen) means a dead token lands the user on the login page with an
  // explanation, instead of every protected page rendering "could not load this view".
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession('Your session has ended. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    if (!getStoredToken()) {
      setUserState(null);
      return null;
    }
    try {
      const me = await apiGet<{ user: AuthUser }>('/api/auth/me');
      setUserState(me.user);
      return me.user;
    } catch (caught) {
      // Only an authentication failure invalidates the session. A network error or a 5xx
      // while the API restarts must not throw away a perfectly good token.
      const status = caught instanceof ApiError ? caught.status : 0;
      if (status === 401 || status === 403) {
        endSession('Your session has ended. Please sign in again.');
      } else {
        setUserState(null);
      }
      return null;
    }
  }, [endSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshUser();
      if (!cancelled) setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiPost<LoginResponse>('/api/auth/login', { email, password });
    // Store first, then publish the user: every request the newly rendered screens make must
    // already find the token in place.
    setStoredToken(response.token);
    setToken(response.token);
    setUserState(response.user);
    setSessionNotice(null);
    setCanPersistSession(isSessionPersistenceAvailable());
    return response.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await apiPost<LoginResponse>('/api/auth/register', payload);
    setStoredToken(response.token);
    setToken(response.token);
    setUserState(response.user);
    setSessionNotice(null);
    setCanPersistSession(isSessionPersistenceAvailable());
    return response.user;
  }, []);

  const logout = useCallback(() => {
    endSession(null);
  }, [endSession]);

  const updateProfile = useCallback(async (payload: Record<string, unknown>) => {
    const response = await apiPatch<{ user: AuthUser }>('/api/auth/me', payload);
    setUserState(response.user);
    return response.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      sessionNotice,
      canPersistSession,
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
      updateProfile,
      clearSessionNotice: () => setSessionNotice(null),
    }),
    [
      user,
      token,
      initializing,
      sessionNotice,
      canPersistSession,
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
