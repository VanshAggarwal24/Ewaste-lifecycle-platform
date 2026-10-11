import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  Recycle,
  Truck,
  Users,
  Weight,
} from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import type { AnalyticsSummary, AssignmentStats, CategoryMixRow, MonthlyPoint, Role, TimelineEvent } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { ROLE_LABELS } from '@/lib/domain';
import { formatDateTime, formatKg, formatNumber, formatPercent } from '@/lib/format';
import { CategoryMixChart, MonthlyTrendChart } from '@/components/charts/Charts';
import { Timeline } from '@/components/domain/Timeline';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  StatCard,
  StatusBadge,
  buttonClasses,
} from '@/components/ui';

interface AdminDashboard {
  role: Role;
  summary: AnalyticsSummary;
  usersByRole: { role: Role; status: string; count: number }[];
  collectionCenters: number;
  assignmentStats: AssignmentStats;
  needsAttention: {
    unassignedPickups: number;
    batchesAwaitingRecycler: number;
    awaitingInspectionItems: number;
  };
  recentActivity: TimelineEvent[];
  monthly: MonthlyPoint[];
  categoryMix: CategoryMixRow[];
}

/** Platform-wide operations view for administrators. */
export function AdminDashboardPage() {
  const fetcher = useCallback((signal: AbortSignal) => dashboardApi.get<AdminDashboard>(signal), []);
  const { data, loading, error, reload } = useResource(fetcher);

  if (loading) return <LoadingBlock label="Loading admin dashboard…" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Dashboard unavailable" />;

  const { summary, needsAttention, assignmentStats } = data;

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="Platform-wide figures read directly from PostgreSQL, with the items that need an operator decision."
        actions={
          <>
            <Link to="/admin/analytics" className={buttonClasses('primary')}>
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Link>
            <Link to="/admin/users" className={buttonClasses('secondary')}>
              <Users className="h-4 w-4" />
              Users
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Items in the system"
          value={formatNumber(summary.items.total)}
          hint={`${formatKg(summary.items.estimatedWeightKg)} declared`}
          icon={<Weight className="h-5 w-5" />}
        />
        <StatCard
          label="Pickup requests"
          value={formatNumber(summary.pickups.total)}
          hint={`${formatNumber(needsAttention.unassignedPickups)} unassigned`}
          icon={<Truck className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Processing batches"
          value={formatNumber(summary.batches.total)}
          hint={`${formatNumber(needsAttention.batchesAwaitingRecycler)} awaiting a recycler`}
          icon={<Boxes className="h-5 w-5" />}
          tone="clay"
        />
        <StatCard
          label="Material recovered"
          value={formatKg(summary.recovery.quantityKg)}
          hint={summary.recovery.yieldPct === null ? 'No inspections yet' : `Yield ${formatPercent(summary.recovery.yieldPct)}`}
          icon={<Recycle className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Needs attention" subtitle="Operator actions generated from live data" />
          <CardBody className="space-y-3">
            <Link
              to="/admin/pickups?status=REQUESTED"
              className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm transition hover:bg-amber-100"
            >
              <span className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Unassigned or failed pickups
              </span>
              <span className="tabular font-semibold text-amber-900">{needsAttention.unassignedPickups}</span>
            </Link>
            <Link
              to="/admin/batches?status=READY"
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-slate-700">
                <Boxes className="h-4 w-4" />
                Batches waiting for a recycler
              </span>
              <span className="tabular font-semibold text-slate-900">{needsAttention.batchesAwaitingRecycler}</span>
            </Link>
            <Link
              to="/center/inspections"
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-slate-700">
                <Weight className="h-4 w-4" />
                Items awaiting inspection
              </span>
              <span className="tabular font-semibold text-slate-900">{needsAttention.awaitingInspectionItems}</span>
            </Link>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Assignment engine</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Attempts</dt>
                  <dd className="tabular font-medium text-slate-800">{formatNumber(assignmentStats.totalAttempts)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Success rate</dt>
                  <dd className="tabular font-medium text-slate-800">
                    {assignmentStats.successRatePct === null ? '—' : formatPercent(assignmentStats.successRatePct)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Average score</dt>
                  <dd className="tabular font-medium text-slate-800">
                    {assignmentStats.averageScore === null ? '—' : assignmentStats.averageScore.toFixed(4)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Average distance</dt>
                  <dd className="tabular font-medium text-slate-800">
                    {assignmentStats.averageDistanceKm === null
                      ? '—'
                      : `${assignmentStats.averageDistanceKm.toFixed(2)} km`}
                  </dd>
                </div>
              </dl>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Platform activity" subtitle="Monthly submissions, collections and recycling" />
          <CardBody>
            <MonthlyTrendChart data={data.monthly} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="People" subtitle={`${formatNumber(data.usersByRole.reduce((s, r) => s + r.count, 0))} accounts`} />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {data.usersByRole.map((row) => (
                <li key={`${row.role}-${row.status}`} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-slate-600">
                    {ROLE_LABELS[row.role] ?? row.role}
                    <span className="ml-2 text-xs text-slate-400">{row.status}</span>
                  </span>
                  <span className="tabular font-medium text-slate-800">{row.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-4 w-4" /> Collection centres
              </span>
              <span className="tabular font-medium text-slate-800">{data.collectionCenters}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Category mix" subtitle="Share of all submitted items" />
          <CardBody>
            <CategoryMixChart data={data.categoryMix} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Latest events" subtitle="Whole-platform status history" />
          <CardBody className="max-h-[22rem] overflow-y-auto">
            <Timeline events={data.recentActivity} emptyTitle="No events recorded yet" />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Assignment engine detail" subtitle="Method mix, outcomes and recent failed attempts" />
        <CardBody className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">By method</p>
            {assignmentStats.byMethod.length === 0 ? (
              <EmptyState title="No assignment attempts yet" />
            ) : (
              <ul className="space-y-2 text-sm">
                {assignmentStats.byMethod.map((row) => (
                  <li key={row.method} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-600">{row.method}</span>
                    <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">By outcome</p>
            <ul className="space-y-2 text-sm">
              {assignmentStats.byOutcome.map((row) => (
                <li key={row.outcome} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <StatusBadge status={row.outcome} />
                  <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
        {assignmentStats.recentFailures.length > 0 ? (
          <CardBody className="border-t border-slate-200">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Recent failures</p>
            <ul className="space-y-2 text-sm">
              {assignmentStats.recentFailures.map((failure) => (
                <li key={failure.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-slate-700">
                    <Link to={`/pickups/${failure.pickupRequest.id}`} className="link">
                      {failure.pickupRequest.requestCode}
                    </Link>{' '}
                    — {failure.reason}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(failure.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        ) : null}
      </Card>
    </>
  );
}
