import { useCallback, useState } from 'react';
import { Building2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/api/client';
import { centerApi } from '@/api/endpoints';
import type { CenterStats, CollectionCenter } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useToast } from '@/context/ToastContext';
import { formatKg, formatNumber, formatPercent, humanize } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

const EMPTY = {
  name: '',
  code: '',
  addressLine: '',
  city: '',
  state: 'Tamil Nadu',
  pincode: '',
  phone: '',
  email: '',
  latitude: '',
  longitude: '',
  capacityKg: '5000',
  status: 'ACTIVE',
};

/** Collection centre CRUD with the statistics read from the centre's own records. */
export function CentersPage() {
  const toast = useToast();
  const [editing, setEditing] = useState<CollectionCenter | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statsTarget, setStatsTarget] = useState<CollectionCenter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionCenter | null>(null);

  const listFetcher = useCallback((signal: AbortSignal) => centerApi.list(undefined, signal), []);
  const { data, loading, error, reload } = useResource(listFetcher);

  const statsFetcher = useCallback(
    (signal: AbortSignal) =>
      statsTarget ? centerApi.stats(statsTarget.id, signal) : Promise.resolve(null),
    [statsTarget],
  );
  const { data: stats, loading: statsLoading } = useResource(statsFetcher, [statsTarget?.id]);

  const createAction = useAction((payload: Record<string, unknown>) => centerApi.create(payload), {
    onError: (caught) => {
      setFormError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      toast.failure(caught, 'Could not create the centre');
    },
  });
  const updateAction = useAction(
    (payload: { id: number; body: Record<string, unknown> }) => centerApi.update(payload.id, payload.body),
    {
      onError: (caught) => {
        setFormError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'Could not update the centre');
      },
    },
  );
  const deleteAction = useAction((id: number) => centerApi.remove(id), {
    onError: (caught) => toast.failure(caught, 'Could not delete the centre'),
  });

  const centers = data?.data ?? [];

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function buildPayload(): Record<string, unknown> {
    return {
      name: form.name.trim(),
      code: form.code.trim(),
      addressLine: form.addressLine.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      capacityKg: Number(form.capacityKg || '5000'),
      status: form.status,
      ...(form.latitude.trim() ? { latitude: Number(form.latitude) } : {}),
      ...(form.longitude.trim() ? { longitude: Number(form.longitude) } : {}),
    };
  }

  return (
    <>
      <PageHeader
        title="Collection centres"
        description="Centres receive items, hold inventory and own the batches released to recyclers."
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setFormError(null);
              setFieldErrors({});
              setCreateOpen(true);
            }}
          >
            New centre
          </Button>
        }
      />

      <Card>
        <CardHeader title="Registered centres" subtitle={`${formatNumber(centers.length)} centre(s)`} icon={<Building2 className="h-4 w-4" />} />

        {loading ? (
          <LoadingBlock label="Loading centres…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : centers.length === 0 ? (
          <EmptyState title="No centres yet" description="Create a centre before items can be received." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Centre</Th>
                <Th>Location</Th>
                <Th>Coordinates</Th>
                <Th align="right">Capacity</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {centers.map((center) => (
                <Tr key={center.id}>
                  <Td>
                    <button
                      type="button"
                      className="link text-left font-medium"
                      onClick={() => setStatsTarget(center)}
                    >
                      {center.name}
                    </button>
                    <span className="block text-xs text-slate-500">{center.code}</span>
                  </Td>
                  <Td>
                    <span className="text-sm">{center.addressLine}</span>
                    <span className="block text-xs text-slate-500">
                      {center.city}, {center.state} {center.pincode}
                    </span>
                  </Td>
                  <Td>
                    {center.latitude === null || center.longitude === null ? (
                      <span className="text-xs text-amber-700">Not set</span>
                    ) : (
                      <span className="tabular text-xs text-slate-600">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {center.latitude.toFixed(4)}, {center.longitude.toFixed(4)}
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatKg(center.capacityKg, 0)}
                  </Td>
                  <Td>
                    <span className="block text-xs text-slate-600">{center.phone ?? '—'}</span>
                    <span className="block text-xs text-slate-400">{center.email ?? '—'}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={center.status} />
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setEditing(center);
                          setForm({
                            name: center.name,
                            code: center.code,
                            addressLine: center.addressLine,
                            city: center.city,
                            state: center.state,
                            pincode: center.pincode,
                            phone: center.phone ?? '',
                            email: center.email ?? '',
                            latitude: center.latitude === null ? '' : String(center.latitude),
                            longitude: center.longitude === null ? '' : String(center.longitude),
                            capacityKg: String(center.capacityKg),
                            status: center.status,
                          });
                          setFormError(null);
                          setFieldErrors({});
                          setCreateOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(center)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Create collection centre'}
        description="Coordinates are optional, but they make agent distance scoring far more accurate."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createAction.running || updateAction.running}
              onClick={async () => {
                setFormError(null);
                setFieldErrors({});
                if (editing) {
                  const { code: _code, ...body } = buildPayload();
                  const result = await updateAction.run({ id: editing.id, body });
                  if (result) {
                    toast.success('Centre updated');
                    setCreateOpen(false);
                    reload();
                  }
                } else {
                  const result = await createAction.run(buildPayload());
                  if (result) {
                    toast.success(`Centre ${result.center.code} created`);
                    setCreateOpen(false);
                    reload();
                  }
                }
              }}
            >
              {editing ? 'Save changes' : 'Create centre'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Centre name"
              name="centerName"
              required
              value={form.name}
              error={fieldErrors.name}
              onChange={(event) => set('name', event.target.value)}
            />
            <TextField
              label="Centre code"
              name="centerCode"
              required
              disabled={Boolean(editing)}
              value={form.code}
              error={fieldErrors.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              hint="Short identifier, e.g. CC-CHN-01. Cannot be changed later."
            />
          </div>
          <TextField
            label="Address"
            name="centerAddress"
            required
            value={form.addressLine}
            error={fieldErrors.addressLine}
            onChange={(event) => set('addressLine', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="City"
              name="centerCity"
              required
              value={form.city}
              error={fieldErrors.city}
              onChange={(event) => set('city', event.target.value)}
            />
            <TextField
              label="State"
              name="centerState"
              required
              value={form.state}
              error={fieldErrors.state}
              onChange={(event) => set('state', event.target.value)}
            />
            <TextField
              label="PIN code"
              name="centerPincode"
              required
              value={form.pincode}
              error={fieldErrors.pincode}
              onChange={(event) => set('pincode', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              label="Latitude"
              name="centerLatitude"
              value={form.latitude}
              error={fieldErrors.latitude}
              onChange={(event) => set('latitude', event.target.value)}
              placeholder="13.0827"
            />
            <TextField
              label="Longitude"
              name="centerLongitude"
              value={form.longitude}
              error={fieldErrors.longitude}
              onChange={(event) => set('longitude', event.target.value)}
              placeholder="80.2707"
              hint="Provide both or neither."
            />
            <TextField
              label="Capacity (kg)"
              name="centerCapacity"
              type="number"
              min="1"
              value={form.capacityKg}
              error={fieldErrors.capacityKg}
              onChange={(event) => set('capacityKg', event.target.value)}
            />
            <SelectField
              label="Status"
              name="centerStatus"
              value={form.status}
              onChange={(event) => set('status', event.target.value)}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'MAINTENANCE', label: 'Maintenance' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Phone"
              name="centerPhone"
              value={form.phone}
              error={fieldErrors.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
            <TextField
              label="Email"
              name="centerEmail"
              type="email"
              value={form.email}
              error={fieldErrors.email}
              onChange={(event) => set('email', event.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(statsTarget)}
        onClose={() => setStatsTarget(null)}
        title={statsTarget ? `${statsTarget.name} — statistics` : 'Centre statistics'}
        description="Aggregated from this centre's items, inspections, batches and recoveries."
        size="md"
      >
        {statsLoading ? (
          <LoadingBlock label="Calculating centre statistics…" rows={4} />
        ) : stats ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Items at centre', value: formatNumber((stats as CenterStats).totalItems) },
                { label: 'Awaiting further steps', value: formatNumber((stats as CenterStats).itemsAtCenter) },
                { label: 'Inspections', value: formatNumber((stats as CenterStats).inspectionsCompleted) },
                {
                  label: 'Open batches',
                  value: `${formatNumber((stats as CenterStats).openBatches)} / ${formatNumber((stats as CenterStats).completedBatches)} done`,
                },
                { label: 'Total weight', value: formatKg((stats as CenterStats).totalWeightKg) },
                { label: 'Recovered weight', value: formatKg((stats as CenterStats).recoveredWeightKg) },
              ].map((entry) => (
                <div key={entry.label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">{entry.label}</p>
                  <p className="tabular text-sm font-semibold text-slate-800">{entry.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Capacity utilisation
              </p>
              <ProgressBar
                value={(stats as CenterStats).capacityUtilizationPct}
                label={`${formatPercent((stats as CenterStats).capacityUtilizationPct)} of ${formatKg(
                  (stats as CenterStats).center.capacityKg,
                  0,
                )}`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Items by status</p>
              <ul className="space-y-1 text-sm">
                {(stats as CenterStats).itemsByStatus.map((row) => (
                  <li key={row.status} className="flex items-center justify-between">
                    <StatusBadge status={row.status} />
                    <span className="tabular font-medium text-slate-800">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-slate-500">
              Incoming pickups waiting for receipt: {(stats as CenterStats).incomingPickups}. Current status:{' '}
              {humanize((stats as CenterStats).center.status)}.
            </p>
          </div>
        ) : (
          <EmptyState title="No statistics available" />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={deleteAction.running}
        title="Delete this centre?"
        message={`${deleteTarget?.name ?? 'This centre'} can only be deleted when no records reference it. Otherwise mark it INACTIVE.`}
        confirmLabel="Delete centre"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteAction.run(deleteTarget.id);
          if (result) {
            toast.success('Centre deleted');
            setDeleteTarget(null);
            reload();
          }
        }}
      />
    </>
  );
}
