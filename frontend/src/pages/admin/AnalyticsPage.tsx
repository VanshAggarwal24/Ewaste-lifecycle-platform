import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, Gauge, Recycle, TrendingUp, Weight } from 'lucide-react';
import { analyticsApi } from '@/api/endpoints';
import type {
  AgentPerformanceRow,
  AnalyticsOverview,
  CenterPerformanceRow,
  CycleTimeRow,
  RecyclerPerformanceRow,
} from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { MATERIAL_LABELS, PATH_LABELS, ROLE_LABELS } from '@/lib/domain';
import { formatCurrency, formatDuration, formatKg, formatNumber, formatPercent, humanize } from '@/lib/format';
import { BreakdownChart, CategoryMixChart, DualBarChart, MaterialRecoveryChart, MonthlyTrendChart } from '@/components/charts/Charts';
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
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui';

/**
 * Analytics screen.
 *
 * Every number is produced by a server-side aggregate query (COUNT / SUM / AVG / GROUP BY) or
 * a raw SQL CTE for cycle times; nothing is computed from a client-side cache and nothing is
 * hard-coded.
 */
export function AnalyticsPage() {
  const overviewFetcher = useCallback((signal: AbortSignal) => analyticsApi.overview(12, signal), []);
  const centersFetcher = useCallback((signal: AbortSignal) => analyticsApi.centers(signal), []);
  const agentsFetcher = useCallback((signal: AbortSignal) => analyticsApi.agents(signal), []);
  const recyclersFetcher = useCallback((signal: AbortSignal) => analyticsApi.recyclers(signal), []);
  const assignmentsFetcher = useCallback((signal: AbortSignal) => analyticsApi.assignments(signal), []);
  const cycleFetcher = useCallback((signal: AbortSignal) => analyticsApi.cycleTimes(signal), []);

  const { data: overview, loading, error, reload } = useResource(overviewFetcher);
  const { data: centers } = useResource(centersFetcher);
  const { data: agents } = useResource(agentsFetcher);
  const { data: recyclers } = useResource(recyclersFetcher);
  const { data: assignments } = useResource(assignmentsFetcher);
  const { data: cycleTimes } = useResource(cycleFetcher);

  if (loading) return <LoadingBlock label="Running aggregate queries…" rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!overview) return <EmptyState title="No analytics available" />;

  const data: AnalyticsOverview = overview;
  const summary = data.summary;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Aggregated directly from PostgreSQL at ${new Date(data.generatedAt).toLocaleString('en-IN')}. Reload to re-run the queries.`}
        actions={
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <TrendingUp className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Items"
          value={formatNumber(summary.items.total)}
          hint={`${formatKg(summary.items.estimatedWeightKg)} declared weight`}
          icon={<Weight className="h-5 w-5" />}
        />
        <StatCard
          label="Inspected weight"
          value={formatKg(summary.inspections.measuredWeightKg)}
          hint={
            summary.inspections.averageQualityScore === null
              ? 'No inspections yet'
              : `Average quality ${summary.inspections.averageQualityScore}/100`
          }
          icon={<Gauge className="h-5 w-5" />}
          tone="clay"
        />
        <StatCard
          label="Recovered material"
          value={formatKg(summary.recovery.quantityKg)}
          hint={
            summary.recovery.yieldPct === null
              ? 'Yield unavailable'
              : `Yield ${formatPercent(summary.recovery.yieldPct)} of inspected weight`
          }
          icon={<Recycle className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Users"
          value={formatNumber(summary.users.reduce((sum, row) => sum + row.count, 0))}
          hint={`${formatNumber(summary.collectionCenters ?? 0)} collection centres`}
          icon={<BarChart3 className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Twelve-month trend" subtitle="Submissions, collections and recycling per month" />
          <CardBody>
            <MonthlyTrendChart data={data.monthly} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Category mix" subtitle="Items grouped by category" />
          <CardBody>
            <CategoryMixChart data={data.categoryMix} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Material recovery" subtitle="Recovered kilograms per material type" />
          <CardBody>
            <MaterialRecoveryChart data={data.materialRecovery} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lifecycle stages" subtitle="Where the items currently stand" />
          <CardBody>
            <BreakdownChart
              data={summary.items.byStatus.map((row) => ({ label: humanize(row.status), count: row.count }))}
              color="#127d56"
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Pickup funnel" subtitle="Requests by status" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {summary.pickups.byStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <StatusBadge status={row.status} />
                  <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Batch pipeline" subtitle="Processing batches by status" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {summary.batches.byStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <StatusBadge status={row.status} />
                  <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts by role" subtitle="Registered users" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {summary.users.map((row) => (
                <li key={row.role} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-slate-600">{ROLE_LABELS[row.role] ?? row.role}</span>
                  <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recovery detail" subtitle="Quantity, records and average assay per material" />
        {data.materialRecovery.length === 0 ? (
          <EmptyState title="No recovery recorded yet" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Records</Th>
                <Th align="right">Average purity</Th>
              </tr>
            </thead>
            <tbody>
              {data.materialRecovery.map((row) => (
                <Tr key={row.materialType}>
                  <Td>{MATERIAL_LABELS[row.materialType] ?? humanize(row.materialType)}</Td>
                  <Td align="right" className="tabular">{formatKg(row.quantityKg)}</Td>
                  <Td align="right" className="tabular">{formatNumber(row.records)}</Td>
                  <Td align="right" className="tabular">
                    {row.averagePurityPct === null ? '—' : formatPercent(row.averagePurityPct)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cycle times" subtitle="Average elapsed time between milestones (raw SQL)" icon={<Clock className="h-4 w-4" />} />
          <CardBody>
            {(cycleTimes ?? []).length === 0 ? (
              <EmptyState title="Not enough history yet" description="Cycle times need completed transitions." />
            ) : (
              <ul className="space-y-3">
                {(cycleTimes as CycleTimeRow[]).map((row) => (
                  <li key={row.stage} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{row.stage}</span>
                      <span className="tabular text-sm font-medium text-slate-900">{formatDuration(row.averageHours)}</span>
                    </div>
                    <p className="text-xs text-slate-400">{formatNumber(row.sampleSize)} sample(s)</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Batch status mix" subtitle="Composition of the batch table" />
          <CardBody>
            <DualBarChart
              data={summary.batches.byStatus.map((row) => ({ status: humanize(row.status), count: row.count }))}
              labelKey="status"
              seriesA={{ key: 'count', name: 'Batches', color: '#127d56' }}
              seriesB={{ key: 'count', name: 'Same series (see table)', color: '#a06d3c' }}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Collection centre performance" subtitle="Received vs recovered weight per centre" />
        {(centers ?? []).length === 0 ? (
          <EmptyState title="No centre data" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Centre</Th>
                <Th>City</Th>
                <Th align="right">Items received</Th>
                <Th align="right">Inspections</Th>
                <Th align="right">Inspected weight</Th>
                <Th align="right">Batches</Th>
                <Th align="right">Recovered</Th>
                <Th align="right">Recovery rate</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(centers as CenterPerformanceRow[]).map((center) => (
                <Tr key={center.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{center.name}</span>
                    <span className="block text-xs text-slate-500">{center.code}</span>
                  </Td>
                  <Td>{center.city}</Td>
                  <Td align="right" className="tabular">{formatNumber(center.itemsReceived)}</Td>
                  <Td align="right" className="tabular">{formatNumber(center.inspections)}</Td>
                  <Td align="right" className="tabular">{formatKg(center.inspectedWeightKg)}</Td>
                  <Td align="right" className="tabular">
                    {formatNumber(center.completedBatches)} / {formatNumber(center.batches)}
                  </Td>
                  <Td align="right" className="tabular">{formatKg(center.recoveredWeightKg)}</Td>
                  <Td align="right" className="tabular">
                    {center.recoveryRatePct === null ? '—' : formatPercent(center.recoveryRatePct)}
                  </Td>
                  <Td>
                    <StatusBadge status={center.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Agent performance" subtitle="Workload, completion and distance from the assignment logs" />
        {(agents ?? []).length === 0 ? (
          <EmptyState title="No agent data" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th>City</Th>
                <Th align="right">Open</Th>
                <Th align="right">Completed</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Collected weight</Th>
                <Th align="right">Avg distance</Th>
                <Th align="right">Completion</Th>
                <Th align="right">Load</Th>
              </tr>
            </thead>
            <tbody>
              {(agents as AgentPerformanceRow[]).map((agent) => (
                <Tr key={agent.agentProfileId}>
                  <Td>
                    <span className="font-medium text-slate-800">{agent.fullName}</span>
                    <span className="block text-xs text-slate-500">
                      {agent.isVerified ? 'Verified' : 'Unverified'} · {agent.isAvailable ? 'available' : 'unavailable'}
                    </span>
                  </Td>
                  <Td>{agent.city ?? '—'}</Td>
                  <Td align="right" className="tabular">{formatNumber(agent.openPickups)}</Td>
                  <Td align="right" className="tabular">{formatNumber(agent.completedPickups)}</Td>
                  <Td align="right" className="tabular">{formatNumber(agent.failedPickups)}</Td>
                  <Td align="right" className="tabular">{formatKg(agent.collectedWeightKg)}</Td>
                  <Td align="right" className="tabular">
                    {agent.averageAssignmentDistanceKm === null
                      ? '—'
                      : `${agent.averageAssignmentDistanceKm.toFixed(2)} km`}
                  </Td>
                  <Td align="right" className="tabular">
                    {agent.completionRatePct === null ? '—' : formatPercent(agent.completionRatePct)}
                  </Td>
                  <Td align="right" className="tabular">
                    {agent.currentLoadCount}/{agent.maxDailyPickups}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recycler performance" subtitle="Throughput and recovered value per organisation" />
        {(recyclers ?? []).length === 0 ? (
          <EmptyState title="No recycler data" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Organisation</Th>
                <Th>Licence</Th>
                <Th align="right">Batches</Th>
                <Th align="right">Items processed</Th>
                <Th align="right">Recovered</Th>
                <Th align="right">Value</Th>
                <Th align="right">Avg purity</Th>
              </tr>
            </thead>
            <tbody>
              {(recyclers as RecyclerPerformanceRow[]).map((recycler) => (
                <Tr key={recycler.recyclerProfileId}>
                  <Td>
                    <span className="font-medium text-slate-800">{recycler.organizationName}</span>
                    <span className="block text-xs text-slate-500">
                      {recycler.acceptedMaterials.length} material stream(s)
                    </span>
                  </Td>
                  <Td>{recycler.licenseNumber}</Td>
                  <Td align="right" className="tabular">
                    {formatNumber(recycler.completedBatches)} / {formatNumber(recycler.totalBatches)}
                  </Td>
                  <Td align="right" className="tabular">{formatNumber(recycler.itemsProcessed)}</Td>
                  <Td align="right" className="tabular">{formatKg(recycler.recoveredKg)}</Td>
                  <Td align="right" className="tabular">{formatCurrency(recycler.recoveredValue)}</Td>
                  <Td align="right" className="tabular">
                    {recycler.averagePurityPct === null ? '—' : formatPercent(recycler.averagePurityPct)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Assignment engine statistics" subtitle="Audit trail aggregates" />
        {assignments ? (
          <CardBody className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Attempts</p>
              <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{formatNumber(assignments.totalAttempts)}</p>
              <p className="text-xs text-slate-500">
                Success rate{' '}
                {assignments.successRatePct === null ? '—' : formatPercent(assignments.successRatePct)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Average score</p>
              <p className="tabular mt-1 text-2xl font-semibold text-slate-900">
                {assignments.averageScore === null ? '—' : assignments.averageScore.toFixed(4)}
              </p>
              <p className="text-xs text-slate-500">
                Average distance{' '}
                {assignments.averageDistanceKm === null ? '—' : `${assignments.averageDistanceKm.toFixed(2)} km`}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Method mix</p>
              <ul className="mt-1 space-y-1 text-sm">
                {assignments.byMethod.map((row) => (
                  <li key={row.method} className="flex justify-between">
                    <span className="text-slate-600">{row.method}</span>
                    <span className="tabular font-medium text-slate-800">{formatNumber(row.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        ) : (
          <LoadingBlock label="Loading assignment stats…" rows={2} />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Most recent decisions" subtitle="Latest status events across the platform" />
        <CardBody>
          <p className="text-sm text-slate-500">
            Paths currently in use:{' '}
            {[
              ...new Set(
                data.categoryMix
                  .map((row) => row.defaultPath)
                  .filter((path): path is NonNullable<typeof path> => Boolean(path)),
              ),
            ]
              .map((path) => PATH_LABELS[path] ?? humanize(path))
              .join(' · ') || 'None recorded'}
          </p>
          <Link to="/activity" className="link mt-3 inline-block text-sm">
            Open the full activity feed
          </Link>
        </CardBody>
      </Card>
    </>
  );
}
