import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/domain';
import { AuthenticatedLayout, RedirectIfAuthenticated, RequireRole } from '@/components/layout/RouteGuards';
import { ROUTE_ROLES } from '@/lib/routeAccess';
import { Spinner } from '@/components/ui';

import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForbiddenPage, NotFoundPage } from '@/pages/status/ErrorPages';

import { UserDashboardPage } from '@/pages/dashboards/UserDashboardPage';
import { AgentDashboardPage } from '@/pages/dashboards/AgentDashboardPage';
import { CenterDashboardPage } from '@/pages/dashboards/CenterDashboardPage';
import { RecyclerDashboardPage } from '@/pages/dashboards/RecyclerDashboardPage';
import { AdminDashboardPage } from '@/pages/dashboards/AdminDashboardPage';

import { ItemsPage } from '@/pages/items/ItemsPage';
import { SubmitItemPage } from '@/pages/items/SubmitItemPage';
import { ItemDetailPage } from '@/pages/items/ItemDetailPage';

import { PickupsPage } from '@/pages/pickups/PickupsPage';
import { PickupDetailPage } from '@/pages/pickups/PickupDetailPage';
import { AgentAssignmentsPage } from '@/pages/pickups/AgentAssignmentsPage';

import { InspectionsPage } from '@/pages/center/InspectionsPage';
import { InspectItemPage } from '@/pages/center/InspectItemPage';
import { BatchesPage } from '@/pages/center/BatchesPage';

import { BatchDetailPage } from '@/pages/batches/BatchDetailPage';
import { RecyclerBatchesPage } from '@/pages/recycler/RecyclerBatchesPage';
import { RecoveriesPage } from '@/pages/recycler/RecoveriesPage';

import { UsersPage } from '@/pages/admin/UsersPage';
import { AgentsPage } from '@/pages/admin/AgentsPage';
import { CentersPage } from '@/pages/admin/CentersPage';
import { CategoriesPage } from '@/pages/admin/CategoriesPage';
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage';

import { ActivityPage } from '@/pages/shared/ActivityPage';
import { ProfilePage } from '@/pages/shared/ProfilePage';

/** Sends `/` to the home screen of the signed-in role. */
function RoleRedirect() {
  const { user, initializing } = useAuth();
  if (initializing) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role]} replace />;
}

/**
 * Route table.
 *
 * The allowed roles for each guarded route come from `ROUTE_ROLES` (lib/routeAccess.ts), which
 * the post-login redirect reads as well — so the two can never disagree about who may open a
 * screen. Guards control navigation only: every screen behind them still calls the API, which
 * re-checks the caller's role, ownership and the record's state on each request.
 */
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthenticated>
            <RegisterPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route element={<AuthenticatedLayout />}>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Citizen */}
        <Route
          path="/dashboard"
          element={
            <RequireRole roles={ROUTE_ROLES['/dashboard']}>
              <UserDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/items/new"
          element={
            <RequireRole roles={ROUTE_ROLES['/items/new']}>
              <SubmitItemPage />
            </RequireRole>
          }
        />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/pickups" element={<PickupsPage />} />
        <Route path="/pickups/:id" element={<PickupDetailPage />} />

        {/* Collection agent */}
        <Route
          path="/agent"
          element={
            <RequireRole roles={ROUTE_ROLES['/agent']}>
              <AgentDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/agent/assignments"
          element={
            <RequireRole roles={ROUTE_ROLES['/agent/assignments']}>
              <AgentAssignmentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/agent/history"
          element={
            <RequireRole roles={ROUTE_ROLES['/agent/history']}>
              <AgentAssignmentsPage />
            </RequireRole>
          }
        />

        {/* Collection centre staff */}
        <Route
          path="/center"
          element={
            <RequireRole roles={ROUTE_ROLES['/center']}>
              <CenterDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/center/incoming"
          element={
            <RequireRole roles={ROUTE_ROLES['/center/incoming']}>
              <PickupsPage title="Incoming pickups" />
            </RequireRole>
          }
        />
        <Route
          path="/center/inspections"
          element={
            <RequireRole roles={ROUTE_ROLES['/center/inspections']}>
              <InspectionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/center/inspect/:id"
          element={
            <RequireRole roles={ROUTE_ROLES['/center/inspect/:id']}>
              <InspectItemPage />
            </RequireRole>
          }
        />
        <Route
          path="/center/batches"
          element={
            <RequireRole roles={ROUTE_ROLES['/center/batches']}>
              <BatchesPage />
            </RequireRole>
          }
        />

        {/* Recycler */}
        <Route
          path="/recycler"
          element={
            <RequireRole roles={ROUTE_ROLES['/recycler']}>
              <RecyclerDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/recycler/batches"
          element={
            <RequireRole roles={ROUTE_ROLES['/recycler/batches']}>
              <RecyclerBatchesPage />
            </RequireRole>
          }
        />
        <Route
          path="/recycler/recoveries"
          element={
            <RequireRole roles={ROUTE_ROLES['/recycler/recoveries']}>
              <RecoveriesPage />
            </RequireRole>
          }
        />

        {/* Shared batch workspace (staff, recycler, admin) */}
        <Route path="/batches/:id" element={<BatchDetailPage />} />

        {/* Administrator */}
        <Route
          path="/admin"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin']}>
              <AdminDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/analytics']}>
              <AnalyticsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/users']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/agents']}>
              <AgentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/centers"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/centers']}>
              <CentersPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/categories']}>
              <CategoriesPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/pickups"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/pickups']}>
              <PickupsPage title="All pickup requests" />
            </RequireRole>
          }
        />
        <Route
          path="/admin/batches"
          element={
            <RequireRole roles={ROUTE_ROLES['/admin/batches']}>
              <BatchesPage includeAll />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
