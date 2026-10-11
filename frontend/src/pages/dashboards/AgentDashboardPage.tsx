import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, Package, Star, Truck, Weight } from 'lucide-react';
import { dashboardApi, pickupApi } from '@/api/endpoints';
import type { EwasteItem, Role, TimelineEvent } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatDateTime, formatKg, formatNumber, formatPercent } from '@/lib/format';
import { Timeline } from '@/components/domain/Timeline';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
  TableWrap,
  Td,
  TextAreaField,
  TextField,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';

interface AgentDashboard {
  role: Role;
  profile: {
    id: number;
    centerId: number | null;
    vehicleType: string | null;
    vehicleCapacityKg: number;
    isAvailable: boolean;
    isVerified: boolean;
    ratingAvg: number;
    currentLoadCount: number;
    maxDailyPickups: number;
    utilizationPct: number;
    center?: { id: number; name: string; code: string; city: string } | null;
  } | null;
  activePickups: {
    id: number;
    requestCode: string;
    status: string;
    preferredDate: string;
    timeSlot: string | null;
    addressLine: string;
    city: string;
    pincode: string;
    agentId: number | null;
    center: { id: number; name: string } | null;
    user: { fullName: string; phone: string | null };
    items: Pick<EwasteItem, 'id' | 'itemCode' | 'name' | 'status'>[];
    _count: { items: number };
  }[];
  toBeDelivered: {
    id: number;
    requestCode: string;
    status: string;
    collectedAt: string | null;
    collectedWeightKg: number | null;
    city: string;
    _count: { items: number };
  }[];
  stats: {
    completedPickups: number;
    failedPickups: number;
    collectedWeightKg: number;
    completionRatePct: number | null;
    recentAssignments: { id: number; outcome: string; method: string; score: number | null; distanceKm: number | null; reason: string; createdAt: string }[];
  };
  recentActivity: TimelineEvent[];
}

/** Collection agent landing page: today's work, workload and performance. */
export function AgentDashboardPage() {
  const toast = useToast();
  const fetcher = useCallback((signal: AbortSignal) => dashboardApi.get<AgentDashboard>(signal), []);
  const { data, loading, error, reload } = useResource(fetcher);

  const [collectTarget, setCollectTarget] = useState<{ id: number; code: string; load: number | null } | null>(null);
  const [collectWeight, setCollectWeight] = useState('');
  const [collectNotes, setCollectNotes] = useState('');

  const acceptAction = useAction((id: number) => pickupApi.accept(id), {
    onError: (caught) => toast.failure(caught, 'Could not accept the pickup'),
  });
  const collectAction = useAction(
    (payload: { id: number; weight?: number; notes?: string }) =>
      pickupApi.collect(payload.id, {
        ...(payload.weight ? { collectedWeightKg: payload.weight } : {}),
        ...(payload.notes ? { notes: payload.notes } : {}),
      }),
    { onError: (caught) => toast.failure(caught, 'Could not record the collection') },
  );

  if (loading) return <LoadingBlock label="Loading your assignments…" rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Dashboard unavailable" />;

  const profile = data.profile;

  return (
    <>
      <PageHeader
        title="Collection agent dashboard"
        description="Your queue, workload and reliability. Assignment is automatic and rule-based; you can decline anything you cannot serve."
        actions={
          <Link to="/agent/assignments" className={buttonClasses('secondary')}>
            All assignments
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open pickups" value={formatNumber(data.activePickups.length)} icon={<Truck className="h-5 w-5" />} />
        <StatCard
          label="Completed"
          value={formatNumber(data.stats.completedPickups)}
          hint={`${formatNumber(data.stats.failedPickups)} failed`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard label="Weight collected" value={formatKg(data.stats.collectedWeightKg)} icon={<Weight className="h-5 w-5" />} tone="clay" />
        <StatCard
          label="Completion rate"
          value={data.stats.completionRatePct === null ? '—' : formatPercent(data.stats.completionRatePct)}
          hint={profile ? `Rating ${profile.ratingAvg.toFixed(1)}/5` : undefined}
          icon={<Star className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Active assignments"
            subtitle="Accept a request to claim it, then record the collection"
            icon={<Truck className="h-4 w-4" />}
          />
          {data.activePickups.length === 0 ? (
            <EmptyState
              title="No open assignments"
              description="New requests are assigned to eligible agents automatically by the scoring engine."
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Citizen</Th>
                  <Th>Pickup address</Th>
                  <Th>Preferred</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.activePickups.map((pickup) => (
                  <Tr key={pickup.id}>
                    <Td>
                      <Link to={`/pickups/${pickup.id}`} className="link font-medium">
                        {pickup.requestCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{pickup._count.items} item(s)</span>
                    </Td>
                    <Td>
                      {pickup.user.fullName}
                      <span className="block text-xs text-slate-500">{pickup.user.phone ?? 'No phone'}</span>
                    </Td>
                    <Td>
                      <span className="flex items-start gap-1 text-sm">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>
                          {pickup.addressLine}
                          <span className="block text-xs text-slate-500">
                            {pickup.city} {pickup.pincode}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      {formatDate(pickup.preferredDate)}
                      {pickup.timeSlot ? <span className="block text-xs text-slate-500">{pickup.timeSlot}</span> : null}
                    </Td>
                    <Td>
                      <StatusBadge status={pickup.status} />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {pickup.status === 'ASSIGNED' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={acceptAction.running}
                            onClick={async () => {
                              const result = await acceptAction.run(pickup.id);
                              if (result) {
                                toast.success(`${pickup.requestCode} accepted`);
                                reload();
                              }
                            }}
                          >
                            Accept
                          </Button>
                        ) : null}
                        {pickup.status === 'ACCEPTED' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setCollectTarget({ id: pickup.id, code: pickup.requestCode, load: null });
                              setCollectWeight('');
                              setCollectNotes('');
                            }}
                          >
                            Record collection
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="My workload" subtitle="Derived from the agent profile used by the engine" />
          <CardBody className="space-y-4">
            {profile ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Active load</span>
                  <span className="tabular font-medium text-slate-800">
                    {profile.currentLoadCount} / {profile.maxDailyPickups}
                  </span>
                </div>
                <ProgressBar
                  value={profile.utilizationPct}
                  tone={profile.utilizationPct > 85 ? 'rose' : profile.utilizationPct > 60 ? 'amber' : 'brand'}
                  label={`${profile.utilizationPct}% of the daily limit`}
                />
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Vehicle</dt>
                    <dd className="font-medium text-slate-800">{profile.vehicleType ?? 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Capacity</dt>
                    <dd className="font-medium text-slate-800">{profile.vehicleCapacityKg} kg</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Availability</dt>
                    <dd>
                      {profile.isAvailable ? <Badge tone="success">Available</Badge> : <Badge tone="danger">Unavailable</Badge>}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Verification</dt>
                    <dd>
                      {profile.isVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Pending</Badge>}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Home centre</dt>
                    <dd className="font-medium text-slate-800">{profile.center?.name ?? '—'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <EmptyState title="No agent profile" description="Ask an administrator to attach an agent profile to your account." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Collected, awaiting delivery" subtitle="Hand these over at your centre" icon={<Clock className="h-4 w-4" />} />
          <CardBody>
            {data.toBeDelivered.length === 0 ? (
              <EmptyState title="Nothing pending delivery" />
            ) : (
              <ul className="space-y-2">
                {data.toBeDelivered.map((pickup) => (
                  <li key={pickup.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <Link to={`/pickups/${pickup.id}`} className="link text-sm font-medium">
                        {pickup.requestCode}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(pickup.collectedAt)} · {formatKg(pickup.collectedWeightKg)} · {pickup._count.items} item(s)
                      </p>
                    </div>
                    <StatusBadge status={pickup.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent assignment decisions" subtitle="Scores from the rule-based engine" />
          <CardBody>
            {data.stats.recentAssignments.length === 0 ? (
              <EmptyState title="No assignment history yet" />
            ) : (
              <ul className="space-y-3">
                {data.stats.recentAssignments.map((log) => (
                  <li key={log.id} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={log.outcome} />
                      <span className="tabular text-xs text-slate-500">
                        {log.score === null ? '—' : log.score.toFixed(4)}
                        {log.distanceKm === null ? '' : ` · ${log.distanceKm.toFixed(2)} km`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{log.reason}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Latest activity" />
          <CardBody className="max-h-[22rem] overflow-y-auto">
            <Timeline events={data.recentActivity} emptyTitle="No activity yet" />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Button variant="secondary" icon={<Package className="h-4 w-4" />} onClick={reload}>
          Refresh queue
        </Button>
      </div>

      <Modal
        open={Boolean(collectTarget)}
        onClose={() => setCollectTarget(null)}
        title={`Record collection — ${collectTarget?.code ?? ''}`}
        description="Confirming the collection moves the request to COLLECTED and frees nothing until the centre receives it."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCollectTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={collectAction.running}
              onClick={async () => {
                if (!collectTarget) return;
                const result = await collectAction.run({
                  id: collectTarget.id,
                  ...(collectWeight.trim() ? { weight: Number(collectWeight) } : {}),
                  ...(collectNotes.trim() ? { notes: collectNotes.trim() } : {}),
                });
                if (result) {
                  toast.success('Collection recorded');
                  setCollectTarget(null);
                  reload();
                }
              }}
            >
              Confirm collection
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Collected weight (kg)"
            name="agentCollectedWeight"
            type="number"
            step="0.01"
            min="0.01"
            value={collectWeight}
            onChange={(event) => setCollectWeight(event.target.value)}
            hint="Optional — the centre records the measured weight at inspection."
          />
          <TextAreaField
            label="Notes"
            name="agentCollectNotes"
            value={collectNotes}
            onChange={(event) => setCollectNotes(event.target.value)}
            placeholder="Handed over by the resident, includes charger and bag…"
          />
        </div>
      </Modal>
    </>
  );
}
