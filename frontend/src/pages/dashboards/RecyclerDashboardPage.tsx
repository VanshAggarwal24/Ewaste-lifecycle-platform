import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CheckCircle2, Factory, Play, Recycle, Weight } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import type { MaterialRecoveryRow, Role, TimelineEvent } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { MATERIAL_LABELS } from '@/lib/domain';
import { formatCurrency, formatDateTime, formatKg, formatNumber, formatPercent, humanize } from '@/lib/format';
import { MaterialRecoveryChart } from '@/components/charts/Charts';
import { Timeline } from '@/components/domain/Timeline';
import {
  Badge,
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
  buttonClasses,
} from '@/components/ui';

interface RecyclerDashboard {
  role: Role;
  profile: {
    id: number;
    organizationName: string;
    licenseNumber: string;
    acceptedMaterials: string[];
    maxCapacityKg: number;
    isActive: boolean;
    contactPhone: string | null;
  } | null;
  assignedBatches: {
    id: number;
    batchCode: string;
    name: string;
    status: string;
    processingPath: string | null;
    releasedAt: string | null;
    center: { id: number; name: string; code: string; city: string } | null;
    _count: { batchItems: number };
  }[];
  recentRecoveries: {
    id: number;
    materialType: string;
    quantityKg: number;
    purityPct: number | null;
    marketValuePerKg: number | null;
    recordedAt: string;
    batch: { id: number; batchCode: string; name: string };
    item: { id: number; itemCode: string; name: string } | null;
  }[];
  stats: {
    completedBatches: number;
    inProgressBatches: number;
    awaitingStart: number;
    recoveredWeightKg: number;
    averagePurityPct: number | null;
    itemsProcessed: number;
  };
  materialRecovery: MaterialRecoveryRow[];
  recentActivity: TimelineEvent[];
}

/** Recycling partner landing page: released batches, processing status and recovery output. */
export function RecyclerDashboardPage() {
  const fetcher = useCallback((signal: AbortSignal) => dashboardApi.get<RecyclerDashboard>(signal), []);
  const { data, loading, error, reload } = useResource(fetcher);

  if (loading) return <LoadingBlock label="Loading recycler dashboard…" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Dashboard unavailable" />;

  return (
    <>
      <PageHeader
        title={data.profile ? data.profile.organizationName : 'Recycler workspace'}
        description={
          data.profile
            ? `Licence ${data.profile.licenseNumber} · capacity ${formatNumber(data.profile.maxCapacityKg)} kg · ${
                data.profile.acceptedMaterials.length
              } accepted material stream(s)`
            : 'Process batches released by collection centres and record recovered material.'
        }
        actions={
          <>
            <Link to="/recycler/batches" className={buttonClasses('primary')}>
              <Boxes className="h-4 w-4" />
              Assigned batches
            </Link>
            <Link to="/recycler/recoveries" className={buttonClasses('secondary')}>
              Recovery records
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting start"
          value={formatNumber(data.stats.awaitingStart)}
          hint="Released to you, not yet started"
          icon={<Play className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="In progress"
          value={formatNumber(data.stats.inProgressBatches)}
          hint={`${formatNumber(data.stats.itemsProcessed)} items processed to date`}
          icon={<Factory className="h-5 w-5" />}
        />
        <StatCard
          label="Completed batches"
          value={formatNumber(data.stats.completedBatches)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Material recovered"
          value={formatKg(data.stats.recoveredWeightKg)}
          hint={
            data.stats.averagePurityPct === null ? 'No purity assays yet' : `Average purity ${data.stats.averagePurityPct}%`
          }
          icon={<Recycle className="h-5 w-5" />}
          tone="clay"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Assigned batches" subtitle="Released and in-progress work" icon={<Boxes className="h-4 w-4" />} />
          {data.assignedBatches.length === 0 ? (
            <EmptyState
              title="No batches assigned"
              description="Centres release batches to your organisation; they appear here immediately."
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Centre</Th>
                  <Th>Items</Th>
                  <Th>Released</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.assignedBatches.map((batch) => (
                  <Tr key={batch.id}>
                    <Td>
                      <Link to={`/batches/${batch.id}`} className="link font-medium">
                        {batch.batchCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{batch.name}</span>
                    </Td>
                    <Td>{batch.center ? `${batch.center.name} (${batch.center.code})` : '—'}</Td>
                    <Td className="tabular">{batch._count.batchItems}</Td>
                    <Td>{formatDateTime(batch.releasedAt)}</Td>
                    <Td>
                      <StatusBadge status={batch.status} />
                    </Td>
                    <Td align="right">
                      <Link to={`/batches/${batch.id}`} className={buttonClasses('primary', 'sm')}>
                        {batch.status === 'RELEASED' ? 'Start' : 'Record recovery'}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Recovery by material" subtitle="Aggregated from your recovery records" />
          <CardBody>
            <MaterialRecoveryChart data={data.materialRecovery} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent recovery records" subtitle="Latest material streams you booked" />
          {data.recentRecoveries.length === 0 ? (
            <EmptyState title="No recovery recorded yet" description="Record material while a batch is in progress." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th>Batch</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Purity</Th>
                  <Th align="right">Value</Th>
                  <Th>Recorded</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentRecoveries.map((recovery) => (
                  <Tr key={recovery.id}>
                    <Td>
                      <span className="font-medium text-slate-800">
                        {MATERIAL_LABELS[recovery.materialType] ?? humanize(recovery.materialType)}
                      </span>
                      {recovery.item ? (
                        <span className="block text-xs text-slate-500">{recovery.item.itemCode}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <Link to={`/batches/${recovery.batch.id}`} className="link text-sm">
                        {recovery.batch.batchCode}
                      </Link>
                    </Td>
                    <Td align="right" className="tabular">
                      {formatKg(recovery.quantityKg)}
                    </Td>
                    <Td align="right" className="tabular">
                      {recovery.purityPct === null ? '—' : formatPercent(recovery.purityPct)}
                    </Td>
                    <Td align="right" className="tabular">
                      {recovery.marketValuePerKg === null
                        ? '—'
                        : formatCurrency(Number(recovery.marketValuePerKg) * Number(recovery.quantityKg))}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500">{formatDateTime(recovery.recordedAt)}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            icon={<Weight className="h-4 w-4" />}
            subtitle="Status events for your organisation"
          />
          <CardBody className="max-h-[22rem] overflow-y-auto">
            <Timeline events={data.recentActivity} emptyTitle="No activity yet" />
          </CardBody>
        </Card>
      </div>

      {data.profile ? (
        <Card className="mt-6">
          <CardHeader title="Accepted materials" subtitle="What your licence covers" />
          <CardBody className="flex flex-wrap gap-2">
            {data.profile.acceptedMaterials.map((material) => (
              <Badge key={material} tone="success">
                {MATERIAL_LABELS[material] ?? humanize(material)}
              </Badge>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
