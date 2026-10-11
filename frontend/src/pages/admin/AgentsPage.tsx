import { useCallback, useState } from 'react';
import { Pencil, Star } from 'lucide-react';
import { ApiError } from '@/api/client';
import { userApi } from '@/api/endpoints';
import type { ListAgentsRow } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useToast } from '@/context/ToastContext';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  StatusBadge,
  TableWrap,
  Td,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

/**
 * Collection agent directory.
 *
 * The fields edited here are exactly the inputs of the assignment engine (capacity,
 * availability, verification, daily limit), which is why the engine's behaviour changes
 * immediately after saving.
 */
export function AgentsPage() {
  const toast = useToast();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [editTarget, setEditTarget] = useState<ListAgentsRow | null>(null);
  const [form, setForm] = useState({
    vehicleType: '',
    vehicleCapacityKg: '',
    maxDailyPickups: '',
    isAvailable: true,
    isVerified: true,
  });
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fetcher = useCallback(
    (signal: AbortSignal) => userApi.agents(onlyAvailable ? { onlyAvailable: true } : undefined, signal),
    [onlyAvailable],
  );
  const { data, loading, error, reload } = useResource(fetcher);

  const updateAction = useAction(
    (payload: { id: number; body: Record<string, unknown> }) => userApi.updateAgentProfile(payload.id, payload.body),
    {
      onError: (caught) => {
        setFormError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'Could not update the agent profile');
      },
    },
  );

  const agents = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Collection agents"
        description="Availability, capacity and verification drive the deterministic assignment engine."
      />

      <Card>
        <CardHeader
          title="Filters"
          actions={
            <CheckboxField
              label="Available only"
              name="onlyAvailable"
              checked={onlyAvailable}
              onChange={(event) => setOnlyAvailable(event.target.checked)}
            />
          }
        />

        {loading ? (
          <LoadingBlock label="Loading agents…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : agents.length === 0 ? (
          <EmptyState title="No agents found" description="Create a collection agent account from the Users screen." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th>Home centre</Th>
                <Th>Vehicle</Th>
                <Th>Load</Th>
                <Th>Rating</Th>
                <Th>State</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <Tr key={agent.agentProfileId}>
                  <Td>
                    <span className="font-medium text-slate-800">{agent.fullName}</span>
                    <span className="block text-xs text-slate-500">{agent.email}</span>
                    {agent.phone ? <span className="block text-xs text-slate-400">{agent.phone}</span> : null}
                  </Td>
                  <Td>{agent.center ? `${agent.center.name} (${agent.center.code})` : '—'}</Td>
                  <Td>
                    {agent.vehicleType ?? 'Not specified'}
                    <span className="block text-xs text-slate-500">{agent.vehicleCapacityKg} kg capacity</span>
                  </Td>
                  <Td className="w-40">
                    <span className="tabular text-xs text-slate-600">
                      {agent.currentLoadCount}/{agent.maxDailyPickups}
                    </span>
                    <ProgressBar
                      value={agent.utilizationPct}
                      tone={agent.utilizationPct > 85 ? 'rose' : agent.utilizationPct > 60 ? 'amber' : 'brand'}
                    />
                    <span className="text-xs text-slate-400">{formatPercent(agent.utilizationPct, 0)} used</span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      {agent.ratingAvg.toFixed(1)}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {agent.isAvailable ? <Badge tone="success">Available</Badge> : <Badge tone="danger">Unavailable</Badge>}
                      {agent.isVerified ? <Badge tone="info">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}
                      {agent.userStatus !== 'ACTIVE' ? <StatusBadge status={agent.userStatus} /> : null}
                    </div>
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setEditTarget(agent);
                        setForm({
                          vehicleType: agent.vehicleType ?? '',
                          vehicleCapacityKg: String(agent.vehicleCapacityKg),
                          maxDailyPickups: String(agent.maxDailyPickups),
                          isAvailable: agent.isAvailable,
                          isVerified: agent.isVerified,
                        });
                        setFormError(null);
                        setFieldErrors({});
                      }}
                    >
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="How these fields are used" subtitle="Hard filters applied before scoring" />
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-700">Verification</p>
            <p className="text-xs text-slate-500">Unverified agents are excluded from every assignment run.</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-700">Availability</p>
            <p className="text-xs text-slate-500">Unavailable agents are skipped until switched back on.</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-700">Daily limit</p>
            <p className="text-xs text-slate-500">Agents at their daily maximum are filtered out.</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-700">Vehicle capacity</p>
            <p className="text-xs text-slate-500">Must be able to carry the estimated pickup weight.</p>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit agent — ${editTarget?.fullName ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={updateAction.running}
              onClick={async () => {
                if (!editTarget) return;
                const result = await updateAction.run({
                  id: editTarget.agentProfileId,
                  body: {
                    ...(form.vehicleType.trim() ? { vehicleType: form.vehicleType.trim() } : {}),
                    vehicleCapacityKg: Number(form.vehicleCapacityKg),
                    maxDailyPickups: Number(form.maxDailyPickups),
                    isAvailable: form.isAvailable,
                    isVerified: form.isVerified,
                  },
                });
                if (result) {
                  toast.success('Agent profile updated');
                  setEditTarget(null);
                  reload();
                }
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />
          <TextField
            label="Vehicle type"
            name="editVehicleType"
            value={form.vehicleType}
            error={fieldErrors.vehicleType}
            onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
          />
          <TextField
            label="Vehicle capacity (kg)"
            name="editVehicleCapacity"
            type="number"
            min="1"
            value={form.vehicleCapacityKg}
            error={fieldErrors.vehicleCapacityKg}
            onChange={(event) => setForm((current) => ({ ...current, vehicleCapacityKg: event.target.value }))}
          />
          <TextField
            label="Max daily pickups"
            name="editMaxDaily"
            type="number"
            min="1"
            value={form.maxDailyPickups}
            error={fieldErrors.maxDailyPickups}
            onChange={(event) => setForm((current) => ({ ...current, maxDailyPickups: event.target.value }))}
          />
          <CheckboxField
            label="Available for assignment"
            name="editIsAvailable"
            checked={form.isAvailable}
            onChange={(event) => setForm((current) => ({ ...current, isAvailable: event.target.checked }))}
          />
          <CheckboxField
            label="Verified"
            name="editIsVerified"
            checked={form.isVerified}
            onChange={(event) => setForm((current) => ({ ...current, isVerified: event.target.checked }))}
          />
          <p className="text-xs text-slate-500">
            {formatNumber(editTarget?.currentLoadCount ?? 0)} of {formatNumber(editTarget?.maxDailyPickups ?? 0)} slots are
            currently held. The load counter is managed by the workflow, not by this form.
          </p>
        </div>
      </Modal>
    </>
  );
}
