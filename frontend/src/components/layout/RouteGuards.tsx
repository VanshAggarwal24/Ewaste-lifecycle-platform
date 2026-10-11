import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/api/types';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/domain';
import { Spinner } from '@/components/ui';
import { AppLayout } from './AppLayout';

/**
 * Route protection.
 *
 * This is a *usability* guard only: it decides which screens a signed-in role sees. The
 * actual authorization is enforced by the API on every request (`authenticate`,
 * `requireRole`, ownership filters), so bypassing these components would still yield 401
 * or 403 from the server and no data.
 */

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-sm text-slate-500">
      <Spinner className="h-7 w-7" />
      <p>{label}</p>
    </div>
  );
}

/** Everything below this component requires a session. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageSpinner label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children ?? <Outlet />}</>;
}

/** Nested inside <RequireAuth>: restricts a branch of the tree to specific roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    // Signed in but not allowed: show the forbidden screen rather than the login page.
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Signed-in users landing on /login or /register are sent to their own home page. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return <FullPageSpinner label="Checking your session…" />;
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

/** The authenticated application frame (sidebar + header). */
export function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  );
}
