import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Route,
  Truck,
  UserCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { centerApi, pickupApi, userApi } from '@/api/endpoints';
import type { AssignmentLog, AssignmentPreview, EwasteItem, ListAgentsRow } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDateTime, formatKg, formatNumber, humanize } from '@/lib/format';
import { Timeline } from '@/components/domain/Timeline';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  TextAreaField,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  );
}

/**
 * Pickup workspace.
 *
 * Which buttons appear is decided by the API: `GET /api/pickups/:id` returns an `actions`
 * array computed from the caller's role/ownership and the request's status. The UI renders
 * exactly those actions: no client-side guesswork, and no decorative button.
 */
export function PickupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pickupId = Number(id);
  const toast = useToast();
  const { user } = useAuth();

  const detailFetcher = useCallback((signal: AbortSignal) => pickupApi.get(pickupId, signal), [pickupId]);
  const timelineFetcher = useCallback((signal: AbortSignal) => pickupApi.timeline(pickupId, signal), [pickupId]);

  const { data: detail, loading, error, reload } = useResource(detailFetcher);
  const { data: timeline, loading: timelineLoading, reload: reloadTimeline } = useResource(timelineFetcher);

  const isStaffOrAdmin = user?.role === 'ADMIN' || user?.role === 'CENTER_STAFF';

  const logsFetcher = useCallback(
    (signal: AbortSignal) =>
      isStaffOrAdmin
        ? pickupApi.assignmentLogs(pickupId, signal)
        : Promise.resolve({ data: [], meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }),
    [pickupId, isStaffOrAdmin],
  );
  const { data: logs, reload: reloadLogs } = useResource(logsFetcher, [isStaffOrAdmin]);

  const [collectOpen, setCollectOpen] = useState(false);
  const [collectWeight, setCollectWeight] = useState('');
  const [collectNotes, setCollectNotes] = useState('');

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveCenterId, setReceiveCenterId] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');

  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMethod, setAssignMethod] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [forceReassign, setForceReassign] = useState(false);

  // Directory data is only readable by coordinators; other roles simply skip the request.
  const centersFetcher = useCallback(
    (signal: AbortSignal) => (isStaffOrAdmin ? centerApi.list(undefined, signal) : Promise.resolve(null)),
    [isStaffOrAdmin],
  );
  const { data: centers } = useResource(centersFetcher, [receiveOpen, isStaffOrAdmin]);
  const agentsFetcher = useCallback(
    (signal: AbortSignal) => (isStaffOrAdmin ? userApi.agents(undefined, signal) : Promise.resolve(null)),
    [isStaffOrAdmin],
  );
  const { data: agents } = useResource(agentsFetcher, [assignOpen, isStaffOrAdmin]);

  const refreshAll = () => {
    reload();
    reloadTimeline();
    reloadLogs();
  };

  const wrap = <TArgs extends unknown[], TResult>(
    action: (...args: TArgs) => Promise<TResult>,
    message: string,
  ) => async (...args: TArgs) => {
    try {
      const result = await action(...args);
      toast.success(message);
      refreshAll();
      return result;
    } catch (caught) {
      toast.failure(caught, 'The action was refused by the API');
      return null;
    }
  };

  const acceptAction = useAction(wrap(() => pickupApi.accept(pickupId), 'Pickup accepted'), {});
  const collectAction = useAction(
    wrap((payload: { collectedWeightKg?: number; notes?: string }) => pickupApi.collect(pickupId, payload), 'Collection recorded'),
    {},
  );
  const receiveAction = useAction(
    wrap((payload: { centerId?: number; notes?: string }) => pickupApi.receive(pickupId, payload), 'Receipt at centre recorded'),
    {},
  );
  const failAction = useAction(wrap((reason: string) => pickupApi.fail(pickupId, reason), 'Pickup marked as failed'), {});
  const cancelAction = useAction(wrap((reason: string) => pickupApi.cancel(pickupId, reason), 'Pickup cancelled'), {});
  const declineAction = useAction(
    wrap((reason: string) => pickupApi.decline(pickupId, reason), 'Assignment declined and released back to the pool'),
    {},
  );
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const assignAction = useAction(
    (payload: { method: 'AUTO' | 'MANUAL'; agentId?: number; force?: boolean }) => pickupApi.assign(pickupId, payload),
    {
      onError: (caught) => toast.failure(caught, 'Assignment failed'),
    },
  );

  if (loading) return <LoadingBlock label="Loading pickup request…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!detail) return <EmptyState title="Pickup request not found" />;

  const { pickupRequest: pickup, actions } = detail;
  const items = (pickup.items ?? []) as EwasteItem[];
  const canAssign = actions.actions.includes('ASSIGN') || isStaffOrAdmin;

  return (
    <>
      <PageHeader
        title={pickup.requestCode}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={pickup.status} />
            <span className="text-sm text-slate-500">{pickup.user?.fullName}</span>
          </span>
        }
        actions={
          <>
            {actions.actions.includes('ACCEPT') ? (
              <Button
                loading={acceptAction.running}
                icon={<UserCheck className="h-4 w-4" />}
                onClick={() => acceptAction.run()}
              >
                Accept assignment
              </Button>
            ) : null}
            {actions.actions.includes('COLLECT') ? (
              <Button icon={<Truck className="h-4 w-4" />} onClick={() => setCollectOpen(true)}>
                Record collection
              </Button>
            ) : null}
            {actions.actions.includes('RECEIVE') ? (
              <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setReceiveOpen(true)}>
                Confirm receipt at centre
              </Button>
            ) : null}
            {actions.actions.includes('DECLINE') ? (
              <Button variant="ghost" icon={<XCircle className="h-4 w-4" />} onClick={() => setDeclineOpen(true)}>
                Decline
              </Button>
            ) : null}
            {actions.actions.includes('FAIL') ? (
              <Button variant="ghost" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setFailOpen(true)}>
                Mark as failed
              </Button>
            ) : null}
            {actions.actions.includes('CANCEL') ? (
              <Button variant="ghost" icon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
                Cancel request
              </Button>
            ) : null}
            {canAssign ? (
              <Button
                variant="subtle"
                icon={<Route className="h-4 w-4" />}
                onClick={() => {
                  setAssignMethod('AUTO');
                  setAssignAgentId('');
                  setForceReassign(Boolean(pickup.agentId));
                  setAssignOpen(true);
                }}
              >
                {pickup.agentId ? 'Reassign' : 'Assign agent'}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Request details" icon={<ClipboardList className="h-4 w-4" />} />
          <CardBody>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <DetailRow label="Owner" value={pickup.user?.fullName} />
                <DetailRow label="Contact" value={pickup.user?.email} />
                <DetailRow label="Phone" value={pickup.user?.phone} />
                <DetailRow
                  label="Address"
                  value={
                    <>
                      {pickup.addressLine}
                      <span className="block text-xs font-normal text-slate-500">
                        {pickup.city}, {pickup.state} {pickup.pincode}
                      </span>
                    </>
                  }
                />
                <DetailRow label="Coordinates" value={pickup.latitude !== null && pickup.longitude !== null ? `${pickup.latitude}, ${pickup.longitude}` : 'Not provided'} />
              </div>
              <div>
                <DetailRow label="Preferred date" value={formatDateTime(pickup.preferredDate)} />
                <DetailRow label="Time slot" value={pickup.timeSlot} />
                <DetailRow label="Estimated weight" value={formatKg(pickup.estimatedWeightKg)} />
                <DetailRow
                  label="Agent"
                  value={
                    pickup.agent ? (
                      <>
                        {pickup.agent.user.fullName}
                        <span className="block text-xs font-normal text-slate-500">
                          {pickup.agent.vehicleType ?? 'Vehicle not specified'} · rated {pickup.agent.ratingAvg}
                        </span>
                      </>
                    ) : (
                      <Badge tone="warning">Not assigned</Badge>
                    )
                  }
                />
                <DetailRow label="Destination centre" value={pickup.center?.name} />
              </div>
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.createdAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Assigned</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.assignedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Accepted</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.acceptedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Collected</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.collectedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Received at centre</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.receivedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Collected weight</p>
                <p className="tabular text-sm font-medium text-slate-800">{formatKg(pickup.collectedWeightKg)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Cancelled</p>
                <p className="text-sm font-medium text-slate-800">{formatDateTime(pickup.cancelledAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Failure reason</p>
                <p className="text-sm font-medium text-slate-800">{pickup.failureReason ?? '—'}</p>
              </div>
            </div>

            {pickup.notes ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{pickup.notes}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Items in this request"
            subtitle={`${items.length} record(s)`}
            icon={<Truck className="h-4 w-4" />}
          />
          <CardBody className="space-y-3">
            {items.length === 0 ? (
              <EmptyState title="No items linked" description="Items are linked at submission time." />
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <Link to={`/items/${item.id}`} className="link text-sm font-medium">
                        {item.name}
                      </Link>
                      <p className="text-xs text-slate-500">{item.itemCode}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {isStaffOrAdmin ? (
        <Card className="mt-6">
          <CardHeader
            title="Assignment audit trail"
            subtitle="Every engine run and manual decision is persisted with its reason"
            icon={<Gauge className="h-4 w-4" />}
          />
          {logs && logs.data.length > 0 ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Method</Th>
                  <Th>Outcome</Th>
                  <Th>Agent</Th>
                  <Th align="right">Score</Th>
                  <Th align="right">Distance</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {logs.data.map((log: AssignmentLog) => (
                  <Tr key={log.id}>
                    <Td>{formatDateTime(log.createdAt)}</Td>
                    <Td>
                      <Badge tone="info">{humanize(log.method)}</Badge>
                    </Td>
                    <Td>
                      <StatusBadge status={log.outcome} />
                    </Td>
                    <Td>{log.agent?.user.fullName ?? '—'}</Td>
                    <Td align="right" className="tabular">
                      {log.score === null ? '—' : log.score.toFixed(4)}
                    </Td>
                    <Td align="right" className="tabular">
                      {log.distanceKm === null ? '—' : `${log.distanceKm.toFixed(2)} km`}
                    </Td>
                    <Td className="max-w-md text-xs text-slate-500">{log.reason}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState title="No assignment attempts recorded yet" description="Run the engine to populate this trail." />
          )}
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Lifecycle timeline" subtitle="Append-only history for this request" />
        <CardBody>
          {timelineLoading ? <LoadingBlock label="Loading timeline…" rows={4} /> : <Timeline events={timeline?.data ?? []} />}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- modals */}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={pickup.agentId ? 'Reassign pickup' : 'Assign collection agent'}
        description="AUTO runs the deterministic scoring engine; MANUAL lets you pick an eligible agent."
        size="lg"
      >
        <AssignmentPanel pickupId={pickupId} open={assignOpen} />
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
          <SelectField
            label="Method"
            name="assignMethod"
            value={assignMethod}
            onChange={(event) => setAssignMethod(event.target.value as 'AUTO' | 'MANUAL')}
            options={[
              { value: 'AUTO', label: 'AUTO — score all eligible agents and pick the best' },
              { value: 'MANUAL', label: 'MANUAL — choose an agent explicitly' },
            ]}
          />
          {assignMethod === 'MANUAL' ? (
            <SelectField
              label="Agent"
              name="assignAgentId"
              value={assignAgentId}
              placeholder="Select an agent"
              options={(agents?.data ?? []).map((agent: ListAgentsRow) => ({
                value: String(agent.userId),
                label: `${agent.fullName} · ${agent.vehicleCapacityKg} kg · load ${agent.currentLoadCount}/${agent.maxDailyPickups}${
                  agent.isAvailable ? '' : ' (unavailable)'
                }`,
              }))}
              onChange={(event) => setAssignAgentId(event.target.value)}
              hint="Only agents who pass every hard filter can be assigned."
            />
          ) : null}
          {pickup.agentId ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={forceReassign}
                onChange={(event) => setForceReassign(event.target.checked)}
              />
              Release the current agent and reassign (administrator only)
            </label>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Close
            </Button>
            <Button
              loading={assignAction.running}
              onClick={async () => {
                const result = await assignAction.run({
                  method: assignMethod,
                  ...(assignMethod === 'MANUAL' && assignAgentId ? { agentId: Number(assignAgentId) } : {}),
                  force: forceReassign,
                });
                if (result) {
                  toast.success(
                    result.assigned
                      ? `Assigned to ${result.agent?.fullName ?? 'agent'} — ${result.reason}`
                      : `No assignment made — ${result.reason}`,
                  );
                  setAssignOpen(false);
                  refreshAll();
                }
              }}
            >
              Run assignment
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Record collection"
        description="Confirms that the agent collected the items from the citizen."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCollectOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={collectAction.running}
              onClick={async () => {
                const result = await collectAction.run({
                  ...(collectWeight.trim() ? { collectedWeightKg: Number(collectWeight) } : {}),
                  ...(collectNotes.trim() ? { notes: collectNotes.trim() } : {}),
                });
                if (result) {
                  setCollectOpen(false);
                  setCollectWeight('');
                  setCollectNotes('');
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
            name="collectedWeightKg"
            type="number"
            step="0.01"
            min="0.01"
            value={collectWeight}
            onChange={(event) => setCollectWeight(event.target.value)}
            hint="Optional — the precise weight is measured at the centre."
          />
          <TextAreaField
            label="Notes"
            name="collectNotes"
            value={collectNotes}
            onChange={(event) => setCollectNotes(event.target.value)}
            placeholder="Anything the centre should know"
          />
        </div>
      </Modal>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Confirm receipt at centre"
        description="Marks the pickup as received and moves its items into the inspection queue."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={receiveAction.running}
              onClick={async () => {
                const result = await receiveAction.run({
                  ...(receiveCenterId ? { centerId: Number(receiveCenterId) } : {}),
                  ...(receiveNotes.trim() ? { notes: receiveNotes.trim() } : {}),
                });
                if (result) {
                  setReceiveOpen(false);
                  setReceiveNotes('');
                }
              }}
            >
              Confirm receipt
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {user?.role === 'ADMIN' ? (
            <SelectField
              label="Receiving centre"
              name="receiveCenterId"
              value={receiveCenterId}
              placeholder="Use the request's centre"
              options={(centers?.data ?? []).map((center) => ({ value: String(center.id), label: `${center.name} (${center.code})` }))}
              onChange={(event) => setReceiveCenterId(event.target.value)}
            />
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Receipt will be recorded against <strong>your centre</strong>.
            </p>
          )}
          <TextAreaField
            label="Notes"
            name="receiveNotes"
            value={receiveNotes}
            onChange={(event) => setReceiveNotes(event.target.value)}
            placeholder="Condition on arrival, discrepancies…"
          />
        </div>
      </Modal>

      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        title="Mark pickup as failed"
        description="Use this when collection could not be completed. The request returns to the pool for reassignment."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFailOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={failAction.running}
              onClick={async () => {
                const result = await failAction.run(failReason.trim());
                if (result) {
                  setFailOpen(false);
                  setFailReason('');
                }
              }}
            >
              Record failure
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          name="failReason"
          required
          value={failReason}
          onChange={(event) => setFailReason(event.target.value)}
          placeholder="Address not found, citizen unavailable, access denied…"
          hint="Minimum 5 characters; stored on the request and in the timeline."
        />
      </Modal>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this assignment"
        description="The agent slot is released and the request goes back for reassignment."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Keep assignment
            </Button>
            <Button
              variant="danger"
              loading={declineAction.running}
              onClick={async () => {
                const result = await declineAction.run(declineReason.trim());
                if (result) {
                  setDeclineOpen(false);
                  setDeclineReason('');
                }
              }}
            >
              Decline assignment
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          name="declineReason"
          required
          value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value)}
          placeholder="Vehicle unavailable, outside my area…"
        />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel pickup request"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep request
            </Button>
            <Button
              variant="danger"
              loading={cancelAction.running}
              onClick={async () => {
                const result = await cancelAction.run(cancelReason.trim());
                if (result) {
                  setCancelOpen(false);
                  setCancelReason('');
                }
              }}
            >
              Cancel request
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason (optional)"
          name="cancelReason"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="No longer required, rescheduling…"
        />
        <p className="mt-3 text-xs text-slate-500">
          Items in a cancelled request are returned to <strong>Submitted</strong> so they can be scheduled again.
        </p>
      </Modal>
    </>
  );
}

/** Dry-run view of the assignment engine for one request. */
function AssignmentPanel({ pickupId, open }: { pickupId: number; open: boolean }) {
  const fetcher = useCallback(
    (signal: AbortSignal) => pickupApi.assignmentPreview(pickupId, signal),
    [pickupId],
  );
  const { data, loading, error } = useResource(fetcher, [open]);

  if (!open) return null;
  if (loading) return <LoadingBlock label="Scoring eligible agents…" rows={3} />;
  if (error) return <InlineError error={error} />;
  if (!data) return null;

  const preview = data as AssignmentPreview;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="info">Location source: {humanize(preview.locationSource)}</Badge>
        <Badge>Max distance: {preview.config.maxDistanceKm} km</Badge>
        <Badge>
          Weights — distance {preview.config.weights.distance}, workload {preview.config.weights.workload}, availability{' '}
          {preview.config.weights.availability}, capacity {preview.config.weights.capacity}
        </Badge>
      </div>

      <p className="text-xs text-slate-500">
        {preview.eligibleCandidates} of {preview.totalCandidates} candidate agents passed the hard eligibility filters.
        {preview.recommended ? ` Recommended: ${preview.recommended.fullName}.` : ' No agent is currently eligible.'}
      </p>

      <TableWrap>
        <thead>
          <tr>
            <Th>Agent</Th>
            <Th>Eligible</Th>
            <Th align="right">Distance</Th>
            <Th align="right">Distance score</Th>
            <Th align="right">Workload</Th>
            <Th align="right">Availability</Th>
            <Th align="right">Capacity</Th>
            <Th align="right">Total</Th>
          </tr>
        </thead>
        <tbody>
          {preview.candidates.map((candidate) => (
            <Tr key={candidate.agentProfileId}>
              <Td>
                <span className="font-medium text-slate-800">{candidate.fullName}</span>
                <span className="block text-xs text-slate-500">
                  load {candidate.currentLoadCount}/{candidate.maxDailyPickups} · {candidate.distanceSource}
                </span>
              </Td>
              <Td>
                {candidate.eligible ? (
                  <Badge tone="success">Yes</Badge>
                ) : (
                  <Badge tone="danger">No</Badge>
                )}
                {!candidate.eligible && candidate.exclusionReasons.length > 0 ? (
                  <span className="mt-1 block max-w-[16rem] text-xs text-slate-500">
                    {candidate.exclusionReasons.join('; ')}
                  </span>
                ) : null}
              </Td>
              <Td align="right" className="tabular">
                {candidate.distanceKm === null ? '—' : `${candidate.distanceKm.toFixed(2)} km`}
              </Td>
              <Td align="right" className="tabular">{candidate.components.distance.toFixed(3)}</Td>
              <Td align="right" className="tabular">{candidate.components.workload.toFixed(3)}</Td>
              <Td align="right" className="tabular">{candidate.components.reliability.toFixed(3)}</Td>
              <Td align="right" className="tabular">{candidate.components.capacity.toFixed(3)}</Td>
              <Td align="right" className="tabular font-semibold">{candidate.totalScore.toFixed(4)}</Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Ranking is fully deterministic: hard filters first, then a weighted score. The full formula is documented in
        docs/ASSIGNMENT_ALGORITHM.md.
      </p>
      <p className="text-xs text-slate-400">{formatNumber(preview.totalCandidates)} candidate rows evaluated.</p>
    </div>
  );
}
