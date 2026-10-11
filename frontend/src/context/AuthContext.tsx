import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPatch, apiPost, getStoredToken, setStoredToken } from '@/api/client';
import type { AuthUser } from '@/api/types';

/**
 * Authentication state for the whole app.
 *
 * The token is held in localStorage (so a refresh keeps the session) and the current user
 * is re-fetched from `GET /api/auth/me` on boot. The server is the authority on identity:
 * the client never trusts a cached role for anything security-relevant — it only uses it to
 * decide which navigation to render. Every protected API call is authorised server-side.
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
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  updateProfile: (payload: Record<string, unknown>) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [initializing, setInitializing] = useState(true);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    if (!getStoredToken()) {
      setUserState(null);
      return null;
    }
    try {
      const me = await apiGet<{ user: AuthUser }>('/api/auth/me');
      setUserState(me.user);
      return me.user;
    } catch {
      // Expired or revoked token — drop the session instead of showing a half-logged-in UI.
      setStoredToken(null);
      setToken(null);
      setUserState(null);
      return null;
    }
  }, []);

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
    setStoredToken(response.token);
    setToken(response.token);
    setUserState(response.user);
    return response.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await apiPost<LoginResponse>('/api/auth/register', payload);
    setStoredToken(response.token);
    setToken(response.token);
    setUserState(response.user);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUserState(null);
  }, []);

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
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
      updateProfile,
    }),
    [user, token, initializing, login, register, logout, refreshUser, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
