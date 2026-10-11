import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Boxes,
  CheckCircle2,
  Factory,
  Pencil,
  Play,
  Plus,
  Recycle,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { ApiError } from '@/api/client';
import { batchApi, recoveryApi, userApi } from '@/api/endpoints';
import type { EwasteItem, ListRecyclersRow, RecoveredMaterial } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MATERIAL_LABELS, MATERIAL_OPTIONS, PATH_LABELS, PATH_OPTIONS } from '@/lib/domain';
import { formatCurrency, formatDate, formatDateTime, formatKg, formatPercent, humanize } from '@/lib/format';
import { Timeline } from '@/components/domain/Timeline';
import {
  Badge,
  Button,
  Card,
  CardBody,
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
  TextAreaField,
  TextField,
  Th,
  Tr,
  buttonClasses,
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
 * Batch workspace.
 *
 * Shows the items in the batch, the material recovery recorded against it and its status
 * history; the action buttons come from the API's `actions` array, which encodes the batch
 * state machine plus the caller's role and ownership.
 */
export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const batchId = Number(id);
  const toast = useToast();
  const { user } = useAuth();

  const detailFetcher = useCallback((signal: AbortSignal) => batchApi.get(batchId, signal), [batchId]);
  const timelineFetcher = useCallback((signal: AbortSignal) => batchApi.timeline(batchId, signal), [batchId]);
  const recoveryFetcher = useCallback((signal: AbortSignal) => batchApi.recoveries(batchId, { limit: 100 }, signal), [
    batchId,
  ]);

  const { data: detail, loading, error, reload } = useResource(detailFetcher);
  const { data: timeline, loading: timelineLoading, reload: reloadTimeline } = useResource(timelineFetcher);
  const { data: recoveries, reload: reloadRecoveries } = useResource(recoveryFetcher);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [recyclerOpen, setRecyclerOpen] = useState(false);
  const [recyclerId, setRecyclerId] = useState('');
  const [recyclerNotes, setRecyclerNotes] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [startNotes, setStartNotes] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeWeight, setCompleteWeight] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState({
    materialType: 'COPPER',
    quantityKg: '',
    purityPct: '',
    marketValuePerKg: '',
    itemId: '',
    notes: '',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', processingPath: '', targetWeightKg: '', notes: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeItemTarget, setRemoveItemTarget] = useState<{ id: number; name: string } | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const actions = detail?.actions;
  const batch = detail?.batch;

  const batchableFetcher = useCallback((signal: AbortSignal) => batchApi.batchableItems(undefined, signal), []);
  const { data: batchable, loading: batchableLoading } = useResource(batchableFetcher, [addOpen]);

  const recyclersFetcher = useCallback(
    (signal: AbortSignal) =>
      actions?.isStaff ? userApi.recyclers({ onlyActive: true }, signal) : Promise.resolve(null),
    [actions?.isStaff],
  );
  const { data: recyclers } = useResource(recyclersFetcher, [recyclerOpen]);

  const run = <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>, message: string) => (
    async (...args: TArgs) => {
      setFormError(null);
      setFieldErrors({});
      try {
        const result = await fn(...args);
        toast.success(message);
        reload();
        reloadTimeline();
        reloadRecoveries();
        return result;
      } catch (caught) {
        setFormError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'The API refused this action');
        return null;
      }
    }
  );

  const readyAction = useAction(run(() => batchApi.markReady(batchId), 'Batch marked ready'));
  const releaseAction = useAction(run((notes?: string) => batchApi.release(batchId, notes), 'Batch released to the recycler'));
  const startAction = useAction(run((notes?: string) => batchApi.start(batchId, notes), 'Processing started'));
  const completeAction = useAction(
    run((payload: { actualWeightKg?: number; notes?: string }) => batchApi.complete(batchId, payload), 'Batch completed'),
  );
  const addItemsAction = useAction(run((itemIds: number[]) => batchApi.addItems(batchId, itemIds), 'Items added to the batch'));
  const removeItemAction = useAction(
    run((itemId: number) => batchApi.removeItem(batchId, itemId), 'Item removed from the batch'),
  );
  const assignRecyclerAction = useAction(
    run((payload: { recyclerId: number; notes?: string }) => batchApi.assignRecycler(batchId, payload.recyclerId, payload.notes), 'Recycler attached to the batch'),
  );
  const updateAction = useAction(run((payload: Record<string, unknown>) => batchApi.update(batchId, payload), 'Batch updated'));
  const deleteAction = useAction(run(() => batchApi.remove(batchId), 'Batch deleted'));
  const recoveryAction = useAction(
    run((payload: Record<string, unknown>) => batchApi.addRecovery(batchId, payload), 'Recovered material recorded'),
  );
  const recoveryUpdateAction = useAction(
    (payload: { id: number; body: Record<string, unknown> }) => recoveryApi.update(payload.id, payload.body),
    { onError: (caught) => toast.failure(caught, 'Could not update the recovery record') },
  );
  const recoveryDeleteAction = useAction((id: number) => recoveryApi.remove(id), {
    onError: (caught) => toast.failure(caught, 'Could not delete the recovery record'),
  });

  if (loading) return <LoadingBlock label="Loading batch…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!batch) return <EmptyState title="Batch not found" />;

  const items = (batch.batchItems ?? []).map((entry) => entry.item).filter(Boolean) as EwasteItem[];
  const recoveryRows: RecoveredMaterial[] = recoveries?.data ?? batch.recoveredMaterials ?? [];
  const canRecordRecovery = actions?.actions.includes('RECORD_RECOVERY');
  const itemWeight = batch.itemWeightKg ?? 0;

  return (
    <>
      <PageHeader
        title={batch.batchCode}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{batch.name}</span>
            <span aria-hidden>·</span>
            <StatusBadge status={batch.status} />
            {batch.processingPath ? (
              <Badge tone="info">{PATH_LABELS[batch.processingPath] ?? humanize(batch.processingPath)}</Badge>
            ) : (
              <Badge>Mixed path</Badge>
            )}
          </span>
        }
        actions={
          <>
            {actions?.actions.includes('MARK_READY') ? (
              <Button loading={readyAction.running} onClick={() => readyAction.run()} icon={<CheckCircle2 className="h-4 w-4" />}>
                Mark ready
              </Button>
            ) : null}
            {actions?.actions.includes('RELEASE') ? (
              <Button onClick={() => setReleaseOpen(true)} icon={<Truck className="h-4 w-4" />}>
                Release to recycler
              </Button>
            ) : null}
            {actions?.actions.includes('START') ? (
              <Button onClick={() => setStartOpen(true)} icon={<Play className="h-4 w-4" />}>
                Start processing
              </Button>
            ) : null}
            {actions?.actions.includes('COMPLETE') ? (
              <Button onClick={() => setCompleteOpen(true)} icon={<CheckCircle2 className="h-4 w-4" />}>
                Complete batch
              </Button>
            ) : null}
            {canRecordRecovery ? (
              <Button variant="subtle" onClick={() => setRecoveryOpen(true)} icon={<Recycle className="h-4 w-4" />}>
                Record recovery
              </Button>
            ) : null}
            {actions?.actions.includes('ASSIGN_RECYCLER') ? (
              <Button variant="secondary" onClick={() => setRecyclerOpen(true)} icon={<Factory className="h-4 w-4" />}>
                {batch.recyclerId ? 'Change recycler' : 'Attach recycler'}
              </Button>
            ) : null}
            {actions?.actions.includes('ADD_ITEMS') ? (
              <Button variant="secondary" onClick={() => setAddOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Add items
              </Button>
            ) : null}
            {actions?.actions.includes('EDIT') ? (
              <Button
                variant="ghost"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => {
                  setEditForm({
                    name: batch.name,
                    processingPath: batch.processingPath ?? '',
                    targetWeightKg: batch.targetWeightKg === null ? '' : String(batch.targetWeightKg),
                    notes: batch.notes ?? '',
                  });
                  setEditOpen(true);
                }}
              >
                Edit
              </Button>
            ) : null}
            {actions?.actions.includes('DELETE') ? (
              <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Batch details" icon={<Boxes className="h-4 w-4" />} />
          <CardBody>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <DetailRow label="Centre" value={batch.center?.name} />
                <DetailRow
                  label="Recycler"
                  value={
                    batch.recycler ? (
                      <>
                        {batch.recycler.recyclerProfile?.organizationName ?? batch.recycler.fullName}
                        <span className="block text-xs font-normal text-slate-500">
                          Licence {batch.recycler.recyclerProfile?.licenseNumber ?? '—'}
                        </span>
                      </>
                    ) : (
                      <Badge tone="warning">Not assigned</Badge>
                    )
                  }
                />
                <DetailRow label="Created by" value={batch.createdBy?.fullName} />
                <DetailRow label="Created" value={formatDateTime(batch.createdAt)} />
              </div>
              <div>
                <DetailRow label="Items" value={items.length} />
                <DetailRow label="Item weight" value={formatKg(itemWeight)} />
                <DetailRow label="Target weight" value={formatKg(batch.targetWeightKg)} />
                <DetailRow label="Actual weight" value={formatKg(batch.actualWeightKg)} />
                <DetailRow label="Released" value={formatDateTime(batch.releasedAt)} />
                <DetailRow label="Started" value={formatDateTime(batch.startedAt)} />
                <DetailRow label="Completed" value={formatDateTime(batch.completedAt)} />
              </div>
            </dl>

            {batch.notes ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{batch.notes}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recovery summary" subtitle="Aggregated from the recovery records" icon={<Recycle className="h-4 w-4" />} />
          <CardBody className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Recovered weight</span>
                <span className="tabular font-medium text-slate-800">{formatKg(batch.recoveredWeightKg ?? 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-slate-500">Recovery rate</span>
                <span className="tabular font-medium text-slate-800">
                  {batch.recoveryRatePct === null || batch.recoveryRatePct === undefined
                    ? '—'
                    : formatPercent(batch.recoveryRatePct)}
                </span>
              </div>
              {batch.recoveryRatePct !== null && batch.recoveryRatePct !== undefined ? (
                <ProgressBar value={batch.recoveryRatePct} label="Recovered ÷ batched weight" />
              ) : null}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Recovered value</span>
              <span className="tabular font-medium text-slate-800">{formatCurrency(batch.recoveredValue ?? 0)}</span>
            </div>

            {batch.status === 'COMPLETED' ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
                Completed batches are immutable. Recovery records can still be corrected by an administrator.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Record every material stream separately. One record per material type per batch is enforced by the
                database.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Items in this batch" subtitle={`${items.length} item(s)`} />
        {items.length === 0 ? (
          <EmptyState
            title="No items in the batch yet"
            description="Add inspected items from your centre while the batch is DRAFT or READY."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Condition</Th>
                <Th>Grade</Th>
                <Th align="right">Weight at addition</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <Link to={`/items/${item.id}`} className="link font-medium">
                      {item.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{item.itemCode}</span>
                  </Td>
                  <Td>{item.category?.name}</Td>
                  <Td>{item.inspection ? humanize(item.inspection.condition) : '—'}</Td>
                  <Td>{item.inspection?.qualityGrade ?? '—'}</Td>
                  <Td align="right" className="tabular">
                    {formatKg(item.inspection?.actualWeightKg)}
                  </Td>
                  <Td align="right">
                    {actions?.actions.includes('REMOVE_ITEMS') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={() => setRemoveItemTarget({ id: item.id, name: item.name })}
                      >
                        Remove
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">Locked</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recovered materials"
          subtitle="One row per material stream, recorded by the assigned recycler"
          icon={<Recycle className="h-4 w-4" />}
        />
        {recoveryRows.length === 0 ? (
          <EmptyState
            title="No material recovery recorded"
            description="The recycler records quantities, purity and value while the batch is IN_PROGRESS."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Purity</Th>
                <Th align="right">Value / kg</Th>
                <Th align="right">Total value</Th>
                <Th>Recorded</Th>
                {user?.role === 'ADMIN' || user?.role === 'RECYCLER' ? <Th align="right">Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {recoveryRows.map((recovery) => (
                <Tr key={recovery.id}>
                  <Td>
                    <span className="font-medium text-slate-800">
                      {MATERIAL_LABELS[recovery.materialType] ?? humanize(recovery.materialType)}
                    </span>
                    {recovery.notes ? <span className="block text-xs text-slate-500">{recovery.notes}</span> : null}
                  </Td>
                  <Td align="right" className="tabular">
                    {formatKg(recovery.quantityKg)}
                  </Td>
                  <Td align="right" className="tabular">
                    {recovery.purityPct === null ? '—' : formatPercent(recovery.purityPct)}
                  </Td>
                  <Td align="right" className="tabular">
                    {recovery.marketValuePerKg === null ? '—' : formatCurrency(recovery.marketValuePerKg)}
                  </Td>
                  <Td align="right" className="tabular">
                    {recovery.marketValuePerKg === null
                      ? '—'
                      : formatCurrency(Number(recovery.marketValuePerKg) * Number(recovery.quantityKg))}
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">{formatDateTime(recovery.recordedAt)}</span>
                    {recovery.recordedBy ? (
                      <span className="block text-xs text-slate-400">{recovery.recordedBy.fullName}</span>
                    ) : null}
                  </Td>
                  {user?.role === 'ADMIN' || user?.role === 'RECYCLER' ? (
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const next = window.prompt(
                              'New quantity in kg',
                              String(recovery.quantityKg),
                            );
                            if (!next) return;
                            const parsed = Number(next);
                            if (!Number.isFinite(parsed) || parsed <= 0) {
                              toast.failure(new Error('Quantity must be a positive number'));
                              return;
                            }
                            const result = await recoveryUpdateAction.run({
                              id: recovery.id,
                              body: { quantityKg: parsed },
                            });
                            if (result) {
                              toast.success('Recovery record updated');
                              reload();
                              reloadRecoveries();
                            }
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={async () => {
                            const result = await recoveryDeleteAction.run(recovery.id);
                            if (result !== null) {
                              toast.success('Recovery record deleted');
                              reload();
                              reloadRecoveries();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Batch timeline" subtitle="Status history for this batch" />
        <CardBody>
          {timelineLoading ? <LoadingBlock label="Loading timeline…" rows={3} /> : <Timeline events={timeline?.data ?? []} />}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------------ modals */}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add inspected items"
        description="Only inspected items that are not already in a batch can be added."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={addItemsAction.running}
              onClick={async () => {
                if (selectedItems.length === 0) {
                  toast.failure(new Error('Select at least one item'));
                  return;
                }
                const result = await addItemsAction.run(selectedItems);
                if (result) {
                  setSelectedItems([]);
                  setAddOpen(false);
                }
              }}
            >
              Add {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}
            </Button>
          </>
        }
      >
        {batchableLoading ? (
          <LoadingBlock label="Loading eligible items…" />
        ) : (batchable?.data ?? []).length === 0 ? (
          <EmptyState title="No eligible items" description="Inspect items at your centre before adding them." />
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {(batchable?.data ?? []).map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2">
                <input
                  id={`add-item-${item.id}`}
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={selectedItems.includes(item.id)}
                  onChange={(event) =>
                    setSelectedItems((current) =>
                      event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id),
                    )
                  }
                />
                <label htmlFor={`add-item-${item.id}`} className="flex-1 cursor-pointer">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{item.name}</span>
                    <span className="tabular text-xs text-slate-500">
                      {formatKg(item.inspection?.actualWeightKg)} · {item.inspection?.qualityGrade ?? '—'}
                    </span>
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.itemCode} · {item.category?.name} · added{' '}
                    {item.inspection?.processingPath
                      ? PATH_LABELS[item.inspection.processingPath] ?? humanize(item.inspection.processingPath)
                      : 'path not set'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={recyclerOpen}
        onClose={() => setRecyclerOpen(false)}
        title="Attach a recycler"
        description="Only licensed, active recyclers that accept the batch materials are valid."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecyclerOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={assignRecyclerAction.running}
              onClick={async () => {
                if (!recyclerId) {
                  toast.failure(new Error('Select a recycler'));
                  return;
                }
                const result = await assignRecyclerAction.run({
                  recyclerId: Number(recyclerId),
                  ...(recyclerNotes.trim() ? { notes: recyclerNotes.trim() } : {}),
                });
                if (result) {
                  setRecyclerOpen(false);
                  setRecyclerId('');
                  setRecyclerNotes('');
                }
              }}
            >
              Attach recycler
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Recycler"
            name="recyclerId"
            value={recyclerId}
            placeholder="Select a recycler"
            options={(recyclers?.data ?? []).map((recycler: ListRecyclersRow) => ({
              value: String(recycler.userId),
              label: `${recycler.organizationName} · ${recycler.acceptedMaterials.length} material(s) · capacity ${recycler.maxCapacityKg} kg`,
            }))}
            onChange={(event) => setRecyclerId(event.target.value)}
          />
          <TextAreaField
            label="Notes"
            name="recyclerNotes"
            value={recyclerNotes}
            onChange={(event) => setRecyclerNotes(event.target.value)}
            placeholder="Instructions shared with the recycler"
          />
        </div>
      </Modal>

      <Modal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Release batch to recycler"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReleaseOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={releaseAction.running}
              onClick={async () => {
                const result = await releaseAction.run(releaseNotes.trim() || undefined);
                if (result) {
                  setReleaseOpen(false);
                  setReleaseNotes('');
                }
              }}
            >
              Release batch
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Releasing requires a recycler to be attached and at least one item in the batch. After release the batch
            moves to the recycler's queue.
          </p>
          <TextAreaField
            label="Release notes"
            name="releaseNotes"
            value={releaseNotes}
            onChange={(event) => setReleaseNotes(event.target.value)}
            placeholder="Handover details, transport reference…"
          />
        </div>
      </Modal>

      <Modal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start processing"
        description="Confirms the recycler has begun dismantling or recovery work."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={startAction.running}
              onClick={async () => {
                const result = await startAction.run(startNotes.trim() || undefined);
                if (result) {
                  setStartOpen(false);
                  setStartNotes('');
                }
              }}
            >
              Start processing
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Notes"
          name="startNotes"
          value={startNotes}
          onChange={(event) => setStartNotes(event.target.value)}
          placeholder="Line assignment, expected completion…"
        />
      </Modal>

      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Complete batch"
        description="A batch can only be completed once at least one recovered material has been recorded."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={completeAction.running}
              onClick={async () => {
                const result = await completeAction.run({
                  ...(completeWeight.trim() ? { actualWeightKg: Number(completeWeight) } : {}),
                  ...(completeNotes.trim() ? { notes: completeNotes.trim() } : {}),
                });
                if (result) {
                  setCompleteOpen(false);
                  setCompleteWeight('');
                  setCompleteNotes('');
                }
              }}
            >
              Complete batch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Actual processed weight (kg)"
            name="completeWeight"
            type="number"
            step="0.01"
            min="0.01"
            value={completeWeight}
            onChange={(event) => setCompleteWeight(event.target.value)}
            hint={`Batched weight: ${formatKg(itemWeight)}`}
          />
          <TextAreaField
            label="Notes"
            name="completeNotes"
            value={completeNotes}
            onChange={(event) => setCompleteNotes(event.target.value)}
            placeholder="Losses, contamination, remarks…"
          />
        </div>
      </Modal>

      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Record recovered material"
        description="One record per material type per batch (enforced by a unique constraint)."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecoveryOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={recoveryAction.running}
              onClick={async () => {
                if (!recoveryForm.quantityKg.trim() || Number(recoveryForm.quantityKg) <= 0) {
                  setFieldErrors({ quantityKg: 'Enter the recovered quantity in kilograms' });
                  return;
                }
                setFieldErrors({});
                const result = await recoveryAction.run({
                  materialType: recoveryForm.materialType,
                  quantityKg: Number(recoveryForm.quantityKg),
                  ...(recoveryForm.purityPct.trim() ? { purityPct: Number(recoveryForm.purityPct) } : {}),
                  ...(recoveryForm.marketValuePerKg.trim()
                    ? { marketValuePerKg: Number(recoveryForm.marketValuePerKg) }
                    : {}),
                  ...(recoveryForm.itemId.trim() ? { itemId: Number(recoveryForm.itemId) } : {}),
                  ...(recoveryForm.notes.trim() ? { notes: recoveryForm.notes.trim() } : {}),
                });
                if (result) {
                  setRecoveryOpen(false);
                  setRecoveryForm({
                    materialType: 'COPPER',
                    quantityKg: '',
                    purityPct: '',
                    marketValuePerKg: '',
                    itemId: '',
                    notes: '',
                  });
                }
              }}
            >
              Save recovery
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Material type"
              name="materialType"
              value={recoveryForm.materialType}
              onChange={(event) => setRecoveryForm((current) => ({ ...current, materialType: event.target.value }))}
              options={MATERIAL_OPTIONS.map((value) => ({ value, label: MATERIAL_LABELS[value] ?? humanize(value) }))}
            />
            <TextField
              label="Quantity (kg)"
              name="quantityKg"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={recoveryForm.quantityKg}
              error={fieldErrors.quantityKg}
              onChange={(event) => setRecoveryForm((current) => ({ ...current, quantityKg: event.target.value }))}
            />
            <TextField
              label="Purity (%)"
              name="purityPct"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={recoveryForm.purityPct}
              onChange={(event) => setRecoveryForm((current) => ({ ...current, purityPct: event.target.value }))}
              hint="Optional — assay result for this stream"
            />
            <TextField
              label="Market value per kg (₹)"
              name="marketValuePerKg"
              type="number"
              step="0.01"
              min="0"
              value={recoveryForm.marketValuePerKg}
              onChange={(event) => setRecoveryForm((current) => ({ ...current, marketValuePerKg: event.target.value }))}
              hint="Optional — used for the recovered value totals"
            />
            <SelectField
              label="Attribute to a specific item"
              name="recoveryItemId"
              value={recoveryForm.itemId}
              placeholder="Batch-level (not item specific)"
              options={items.map((item) => ({ value: String(item.id), label: `${item.itemCode} — ${item.name}` }))}
              onChange={(event) => setRecoveryForm((current) => ({ ...current, itemId: event.target.value }))}
              className="sm:col-span-2"
            />
          </div>
          <TextAreaField
            label="Notes"
            name="recoveryNotes"
            value={recoveryForm.notes}
            onChange={(event) => setRecoveryForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Sorting line, contamination notes…"
          />
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit batch"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updateAction.running}
              onClick={async () => {
                const result = await updateAction.run({
                  name: editForm.name.trim(),
                  processingPath: editForm.processingPath || null,
                  targetWeightKg: editForm.targetWeightKg.trim() ? Number(editForm.targetWeightKg) : null,
                  notes: editForm.notes.trim() || null,
                });
                if (result) setEditOpen(false);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Batch name"
            name="editBatchName"
            value={editForm.name}
            onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
          />
          <SelectField
            label="Processing path"
            name="editBatchPath"
            value={editForm.processingPath}
            placeholder="Mixed / undecided"
            options={PATH_OPTIONS.map((value) => ({ value, label: PATH_LABELS[value] ?? humanize(value) }))}
            onChange={(event) => setEditForm((current) => ({ ...current, processingPath: event.target.value }))}
          />
          <TextField
            label="Target weight (kg)"
            name="editBatchTarget"
            type="number"
            step="0.01"
            value={editForm.targetWeightKg}
            onChange={(event) => setEditForm((current) => ({ ...current, targetWeightKg: event.target.value }))}
          />
          <TextAreaField
            label="Notes"
            name="editBatchNotes"
            value={editForm.notes}
            onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={deleteAction.running}
        title="Delete this draft batch?"
        message="Only batches still in DRAFT can be deleted. The items return to the pool of inspected items."
        confirmLabel="Delete batch"
        onConfirm={async () => {
          const result = await deleteAction.run();
          if (result) {
            toast.success('Batch deleted');
            window.location.assign('/center/batches');
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(removeItemTarget)}
        onClose={() => setRemoveItemTarget(null)}
        busy={removeItemAction.running}
        title="Remove item from batch?"
        message={`${removeItemTarget?.name ?? 'This item'} will be removed from the batch and become available for batching again.`}
        confirmLabel="Remove item"
        onConfirm={async () => {
          if (!removeItemTarget) return;
          const result = await removeItemAction.run(removeItemTarget.id);
          if (result) setRemoveItemTarget(null);
        }}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          to={user?.role === 'RECYCLER' ? '/recycler/batches' : '/center/batches'}
          className={buttonClasses('secondary')}
        >
          Back to batches
        </Link>
        <p className="text-xs text-slate-500">Created {formatDate(batch.createdAt)}</p>
      </div>
    </>
  );
}
