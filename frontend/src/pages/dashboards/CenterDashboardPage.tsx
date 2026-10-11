import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ClipboardCheck, PackageCheck, Recycle, Truck, Weight } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import type { CollectionCenter, Role } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { PATH_LABELS } from '@/lib/domain';
import { formatDateTime, formatKg, formatNumber, humanize } from '@/lib/format';
import { BreakdownChart } from '@/components/charts/Charts';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  GradeBadge,
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

interface CenterDashboard {
  role: Role;
  center: Pick<CollectionCenter, 'id' | 'name' | 'code' | 'city' | 'capacityKg' | 'status'> | null;
  itemsByStatus: { status: string; count: number }[];
  totalItemsAtCenter: number;
  pendingInspection: number;
  incomingPickups: {
    id: number;
    requestCode: string;
    status: string;
    collectedAt: string | null;
    collectedWeightKg: number | null;
    city: string;
    user: { fullName: string; phone: string | null };
    agent: { user: { fullName: string; phone: string | null } } | null;
    _count: { items: number };
  }[];
  openBatches: {
    id: number;
    batchCode: string;
    name: string;
    status: string;
    processingPath: string | null;
    itemCount?: number;
    recycler: { fullName: string; recyclerProfile: { organizationName: string } | null } | null;
    _count: { batchItems: number; recoveredMaterials: number };
  }[];
  recentInspections: {
    id: number;
    condition: string;
    qualityGrade: string;
    processingPath: string;
    actualWeightKg: number;
    inspectedAt: string;
    item: { id: number; itemCode: string; name: string };
    inspectedBy: { fullName: string } | null;
  }[];
  stats: { inspectedWeightKg: number; batchesReadyToRelease: number; recoveredWeightKg: number };
}

/** Collection centre landing page: what arrived, what needs inspection, what is moving. */
export function CenterDashboardPage() {
  const fetcher = useCallback((signal: AbortSignal) => dashboardApi.get<CenterDashboard>(signal), []);
  const { data, loading, error, reload } = useResource(fetcher);

  if (loading) return <LoadingBlock label="Loading centre dashboard…" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Dashboard unavailable" />;

  const center = data.center;

  return (
    <>
      <PageHeader
        title={center ? `${center.name} (${center.code})` : 'Collection centre'}
        description={
          center
            ? `${center.city} · capacity ${formatNumber(center.capacityKg)} kg · status ${humanize(center.status)}`
            : 'Centre workspace for receiving, inspecting and batching e-waste.'
        }
        actions={
          <>
            <Link to="/center/inspections" className={buttonClasses('primary')}>
              <ClipboardCheck className="h-4 w-4" />
              Inspect queue
            </Link>
            <Link to="/center/batches" className={buttonClasses('secondary')}>
              Batches
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Items at centre"
          value={formatNumber(data.totalItemsAtCenter)}
          icon={<PackageCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Awaiting inspection"
          value={formatNumber(data.pendingInspection)}
          hint="Received but not yet classified"
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Inspected weight"
          value={formatKg(data.stats.inspectedWeightKg)}
          hint={`${formatNumber(data.stats.batchesReadyToRelease)} batch(es) ready to release`}
          icon={<Weight className="h-5 w-5" />}
          tone="clay"
        />
        <StatCard
          label="Material recovered"
          value={formatKg(data.stats.recoveredWeightKg)}
          hint="From batches processed at this centre"
          icon={<Recycle className="h-5 w-5" />}
          tone="sky"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Incoming pickups"
            subtitle="Collected by agents and awaiting your receipt confirmation"
            icon={<Truck className="h-4 w-4" />}
            actions={
              <Link to="/center/incoming" className={buttonClasses('secondary', 'sm')}>
                Open queue
              </Link>
            }
          />
          {data.incomingPickups.length === 0 ? (
            <EmptyState title="No deliveries in transit" description="Collected requests appear here until they are received." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Citizen</Th>
                  <Th>Agent</Th>
                  <Th>Collected</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.incomingPickups.map((pickup) => (
                  <Tr key={pickup.id}>
                    <Td>
                      <Link to={`/pickups/${pickup.id}`} className="link font-medium">
                        {pickup.requestCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{pickup._count.items} item(s)</span>
                    </Td>
                    <Td>{pickup.user.fullName}</Td>
                    <Td>{pickup.agent?.user.fullName ?? '—'}</Td>
                    <Td>
                      {pickup.collectedAt ? (
                        <>
                          <span className="text-sm">{formatKg(pickup.collectedWeightKg)}</span>
                          <span className="block text-xs text-slate-500">{formatDateTime(pickup.collectedAt)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td align="right">
                      <Link to={`/pickups/${pickup.id}`} className={buttonClasses('primary', 'sm')}>
                        Receive
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Items by status" subtitle="Live counts for this centre" />
          <CardBody>
            <BreakdownChart
              data={data.itemsByStatus.map((row) => ({ label: humanize(row.status), count: row.count }))}
              color="#1f9b6c"
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Open batches"
            subtitle="Draft, ready and in-flight processing batches"
            icon={<Boxes className="h-4 w-4" />}
            actions={
              <Link to="/center/batches" className={buttonClasses('secondary', 'sm')}>
                Manage batches
              </Link>
            }
          />
          {data.openBatches.length === 0 ? (
            <EmptyState title="No open batches" description="Build a batch from inspected items to start processing." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Path</Th>
                  <Th>Items</Th>
                  <Th>Recycler</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.openBatches.map((batch) => (
                  <Tr key={batch.id}>
                    <Td>
                      <Link to={`/batches/${batch.id}`} className="link font-medium">
                        {batch.batchCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{batch.name}</span>
                    </Td>
                    <Td>{batch.processingPath ? PATH_LABELS[batch.processingPath] ?? humanize(batch.processingPath) : 'Mixed'}</Td>
                    <Td className="tabular">{batch._count.batchItems}</Td>
                    <Td>{batch.recycler?.recyclerProfile?.organizationName ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={batch.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent inspections" subtitle="Latest classifications at this centre" />
          <CardBody>
            {data.recentInspections.length === 0 ? (
              <EmptyState title="Nothing inspected yet" />
            ) : (
              <ul className="space-y-3">
                {data.recentInspections.map((inspection) => (
                  <li key={inspection.id} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/items/${inspection.item.id}`} className="link text-sm font-medium">
                        {inspection.item.name}
                      </Link>
                      <GradeBadge grade={inspection.qualityGrade} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {inspection.item.itemCode} · {formatKg(inspection.actualWeightKg)} ·{' '}
                      {PATH_LABELS[inspection.processingPath] ?? humanize(inspection.processingPath)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(inspection.inspectedAt)}
                      {inspection.inspectedBy ? ` · ${inspection.inspectedBy.fullName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
