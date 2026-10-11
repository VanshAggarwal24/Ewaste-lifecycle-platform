import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Ruler } from 'lucide-react';
import { inspectionApi, itemApi } from '@/api/endpoints';
import type { EwasteItem } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { CONDITION_LABELS, PATH_LABELS } from '@/lib/domain';
import { formatDate, formatDateTime, formatKg, formatNumber, humanize } from '@/lib/format';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  GradeBadge,
  HazardBadge,
  LoadingBlock,
  PageHeader,
  StatCard,
  StatusBadge,
  TableWrap,
  Td,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';

/**
 * Inspection queue: items received at the caller's centre that have no inspection yet.
 * The summary panel comes from `GET /api/inspections/summary`, which aggregates the
 * inspection table itself.
 */
export function InspectionsPage() {
  const queueFetcher = useCallback((signal: AbortSignal) => itemApi.pendingInspection({ limit: 100 }, signal), []);
  const summaryFetcher = useCallback((signal: AbortSignal) => inspectionApi.summary(undefined, signal), []);
  const recentFetcher = useCallback((signal: AbortSignal) => inspectionApi.list({ limit: 10 }, signal), []);

  const { data: queue, loading, error, reload } = useResource(queueFetcher);
  const { data: summary } = useResource(summaryFetcher);
  const { data: recent, loading: recentLoading } = useResource(recentFetcher);

  const items = queue?.data ?? [];

  return (
    <>
      <PageHeader
        title="Inspect & classify"
        description="Record the measured weight, condition, quality score and processing path for every received item."
      />

      {summary ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Inspections completed"
            value={formatNumber(summary.inspectionsCompleted)}
            icon={<ClipboardCheck className="h-5 w-5" />}
          />
          <StatCard label="Measured weight" value={formatKg(summary.totalWeightKg)} tone="clay" />
          <StatCard
            label="Average quality"
            value={summary.averageQualityScore === null ? '—' : `${summary.averageQualityScore}/100`}
            tone="sky"
          />
          <StatCard
            label="Hazard flagged"
            value={formatNumber(summary.hazardFlagged)}
            hint="Items requiring special handling"
            tone="amber"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Awaiting inspection"
          subtitle={`${items.length} item(s) received but not yet classified`}
          icon={<Ruler className="h-4 w-4" />}
        />
        {loading ? (
          <LoadingBlock label="Loading inspection queue…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            description="Items appear here as soon as a pickup is received at your centre."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Owner</Th>
                <Th>Received</Th>
                <Th align="right">Declared</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: EwasteItem) => (
                <Tr key={item.id}>
                  <Td>
                    <Link to={`/items/${item.id}`} className="link font-medium">
                      {item.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{item.itemCode}</span>
                  </Td>
                  <Td>
                    {item.category?.name}
                    {item.category ? <span className="ml-2 inline-block">{<HazardBadge level={item.category.hazardLevel} />}</span> : null}
                  </Td>
                  <Td>{item.user?.fullName ?? `#${item.userId}`}</Td>
                  <Td>{formatDate(item.updatedAt)}</Td>
                  <Td align="right" className="tabular">
                    {formatKg(item.estimatedWeightKg)}
                  </Td>
                  <Td align="right">
                    <Link to={`/center/inspect/${item.id}`} className={buttonClasses('primary', 'sm')}>
                      Inspect
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recently inspected" subtitle="The ten most recent classifications at your centre" />
          {recentLoading ? (
            <LoadingBlock label="Loading inspections…" />
          ) : (recent?.data ?? []).length === 0 ? (
            <EmptyState title="No inspections recorded yet" />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Condition</Th>
                  <Th>Grade</Th>
                  <Th>Path</Th>
                  <Th align="right">Weight</Th>
                  <Th>Inspected</Th>
                </tr>
              </thead>
              <tbody>
                {(recent?.data ?? []).map((inspection) => (
                  <Tr key={inspection.id}>
                    <Td>
                      <Link to={`/items/${inspection.itemId}`} className="link font-medium">
                        {inspection.item?.name ?? `Item #${inspection.itemId}`}
                      </Link>
                      <span className="block text-xs text-slate-500">{inspection.item?.itemCode}</span>
                    </Td>
                    <Td>{CONDITION_LABELS[inspection.condition] ?? humanize(inspection.condition)}</Td>
                    <Td>
                      <GradeBadge grade={inspection.qualityGrade} />
                    </Td>
                    <Td>{PATH_LABELS[inspection.processingPath] ?? humanize(inspection.processingPath)}</Td>
                    <Td align="right" className="tabular">
                      {formatKg(inspection.actualWeightKg)}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500">{formatDateTime(inspection.inspectedAt)}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Distribution" subtitle="Where inspected items are routed" />
          <CardBody>
            {summary && summary.byProcessingPath.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {summary.byProcessingPath.map((row) => (
                  <li key={row.path} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-600">{PATH_LABELS[row.path] ?? humanize(row.path)}</span>
                    <span className="tabular font-medium text-slate-800">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No routing data yet" />
            )}

            {summary && summary.byGrade.length > 0 ? (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Quality grades</p>
                <ul className="space-y-2 text-sm">
                  {summary.byGrade.map((row) => (
                    <li key={row.grade} className="flex items-center justify-between">
                      <GradeBadge grade={row.grade} />
                      <span className="tabular font-medium text-slate-800">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <StatusBadge status="RECEIVED_AT_CENTER" /> items feed this queue.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
