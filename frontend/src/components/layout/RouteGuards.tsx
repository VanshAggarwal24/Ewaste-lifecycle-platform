import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/api/types';
import { useAuth } from '@/context/AuthContext';
import { safeDestination } from '@/lib/routeAccess';
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
  if (!user) {
    // Remember where the visitor was heading, so a successful sign-in can return them there —
    // but only when their role may actually open it (see RedirectIfAuthenticated).
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

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

/**
 * Signed-in users landing on /login or /register are sent on.
 *
 * This component is the *only* place that navigates after a successful sign-in. The login and
 * registration forms deliberately do not navigate themselves: two competing navigations made
 * the destination depend on which one React applied last, which is how a user could end up on
 * a screen their role is not allowed to open. `safeDestination` honours the page the visitor
 * originally asked for when their role may open it, and falls back to their own home screen.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageSpinner label="Checking your session…" />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={safeDestination(user.role, from)} replace />;
  }
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
