import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Plus } from 'lucide-react';
import { ApiError } from '@/api/client';
import { batchApi } from '@/api/endpoints';
import type { EwasteItem, ProcessingBatch } from '@/api/types';
import { useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { BATCH_STATUS_OPTIONS, PATH_LABELS, PATH_OPTIONS } from '@/lib/domain';
import { formatDate, formatKg, humanize } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  TextAreaField,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

/**
 * Processing batch management for centre staff.
 *
 * A batch can only be built from items that have been inspected and are not already in
 * another batch — the API enforces the unique constraint, and `batchable-items` returns
 * exactly the eligible pool for this centre.
 */
export function BatchesPage({ includeAll = false }: { includeAll?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = user?.role === 'CENTER_STAFF' || user?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const [newBatch, setNewBatch] = useState({ name: '', processingPath: '', targetWeightKg: '', notes: '' });
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const listFetcher = useCallback(
    (signal: AbortSignal) =>
      batchApi.list({ page, limit: 15, ...(status ? { status } : {}), ...(includeAll ? {} : {}) }, signal),
    [page, status, includeAll],
  );
  const { data, loading, error, reload } = useResource(listFetcher);

  const batchableFetcher = useCallback(
    (signal: AbortSignal) => batchApi.batchableItems({ processingPath: newBatch.processingPath || undefined }, signal),
    [newBatch.processingPath],
  );
  const { data: batchable, loading: batchableLoading, reload: reloadBatchable } = useResource(batchableFetcher, [
    createOpen,
    newBatch.processingPath,
  ]);

  const createAction = useAction((payload: Record<string, unknown>) => batchApi.create(payload), {
    onError: (caught) => {
      setFormError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      toast.failure(caught, 'Could not create the batch');
    },
  });

  const rows = data?.data ?? [];
  const availableItems = batchable?.data ?? [];

  const selectedWeight = useMemo(
    () =>
      availableItems
        .filter((item: EwasteItem) => selectedItems.includes(item.id))
        .reduce((sum: number, item: EwasteItem) => sum + Number(item.inspection?.actualWeightKg ?? 0), 0),
    [availableItems, selectedItems],
  );

  async function submitCreate() {
    setFormError(null);
    const localErrors: Record<string, string> = {};
    if (newBatch.name.trim().length < 3) localErrors.name = 'Give the batch a name of at least 3 characters';
    if (selectedItems.length === 0) localErrors.itemIds = 'Select at least one inspected item';
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const result = await createAction.run({
      name: newBatch.name.trim(),
      ...(newBatch.processingPath ? { processingPath: newBatch.processingPath } : {}),
      ...(newBatch.targetWeightKg.trim() ? { targetWeightKg: Number(newBatch.targetWeightKg) } : {}),
      ...(newBatch.notes.trim() ? { notes: newBatch.notes.trim() } : {}),
      itemIds: selectedItems,
    });

    if (result) {
      toast.success(`Batch ${result.batch.batchCode} created as a draft`);
      setCreateOpen(false);
      setNewBatch({ name: '', processingPath: '', targetWeightKg: '', notes: '' });
      setSelectedItems([]);
      reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Processing batches"
        description="Group inspected items, assign a recycler, release the batch and track what comes back as recovered material."
        actions={
          canManage ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setCreateOpen(true);
                setFormError(null);
                setFieldErrors({});
                setSelectedItems([]);
                reloadBatchable();
              }}
            >
              New batch
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Filter"
          actions={
            <SelectField
              label=""
              name="batchStatusFilter"
              value={status}
              placeholder="All statuses"
              className="w-56"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={BATCH_STATUS_OPTIONS.map((value) => ({ value, label: humanize(value) }))}
            />
          }
        />

        {loading ? (
          <LoadingBlock label="Loading batches…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No batches yet"
            description="Create a batch from inspected items and release it to an approved recycler."
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Path</Th>
                  <Th>Items</Th>
                  <Th>Weight</Th>
                  <Th>Recycler</Th>
                  <Th>Status</Th>
                  <Th align="right">Created</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((batch: ProcessingBatch) => (
                  <Tr key={batch.id}>
                    <Td>
                      <Link to={`/batches/${batch.id}`} className="link font-medium">
                        {batch.batchCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{batch.name}</span>
                    </Td>
                    <Td>
                      {batch.processingPath ? (
                        PATH_LABELS[batch.processingPath] ?? humanize(batch.processingPath)
                      ) : (
                        <Badge>Mixed</Badge>
                      )}
                    </Td>
                    <Td className="tabular">{batch._count?.batchItems ?? batch.itemCount ?? 0}</Td>
                    <Td className="tabular">
                      {formatKg(batch.actualWeightKg ?? batch.itemWeightKg ?? batch.targetWeightKg)}
                    </Td>
                    <Td>
                      {batch.recycler?.recyclerProfile?.organizationName ?? (
                        <span className="text-xs text-amber-700">Not assigned</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={batch.status} />
                    </Td>
                    <Td align="right">{formatDate(batch.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create processing batch"
        description="Only inspected items from your centre that are not already batched can be selected."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createAction.running} onClick={submitCreate} icon={<Boxes className="h-4 w-4" />}>
              Create draft batch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Batch name"
              name="batchName"
              required
              value={newBatch.name}
              error={fieldErrors.name}
              onChange={(event) => setNewBatch((current) => ({ ...current, name: event.target.value }))}
              placeholder="Chennai copper recovery — October"
            />
            <SelectField
              label="Processing path"
              name="batchPath"
              value={newBatch.processingPath}
              placeholder="Mixed / undecided"
              onChange={(event) => setNewBatch((current) => ({ ...current, processingPath: event.target.value }))}
              options={PATH_OPTIONS.map((value) => ({ value, label: PATH_LABELS[value] ?? humanize(value) }))}
            />
            <TextField
              label="Target weight (kg)"
              name="batchTargetWeight"
              type="number"
              step="0.01"
              min="0.01"
              value={newBatch.targetWeightKg}
              error={fieldErrors.targetWeightKg}
              onChange={(event) => setNewBatch((current) => ({ ...current, targetWeightKg: event.target.value }))}
              placeholder="Optional"
            />
            <div className="flex flex-col justify-end">
              <span className="field-label">Selected</span>
              <p className="tabular rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                {selectedItems.length} item(s) · {formatKg(selectedWeight)}
              </p>
            </div>
          </div>

          <TextAreaField
            label="Notes"
            name="batchNotes"
            rows={2}
            value={newBatch.notes}
            onChange={(event) => setNewBatch((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Handling instructions, expected output…"
          />

          <div>
            <p className="field-label">Inspected items available for batching</p>
            {fieldErrors.itemIds ? <p className="field-error mb-2">{fieldErrors.itemIds}</p> : null}

            {batchableLoading ? (
              <LoadingBlock label="Loading eligible items…" rows={3} />
            ) : availableItems.length === 0 ? (
              <EmptyState
                title="No items are ready to batch"
                description="Inspect received items first, or check the processing path filter."
              />
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {availableItems.map((item: EwasteItem) => (
                  <li key={item.id} className="flex items-start gap-3 px-3 py-2">
                    <input
                      id={`batch-item-${item.id}`}
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={selectedItems.includes(item.id)}
                      onChange={(event) =>
                        setSelectedItems((current) =>
                          event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id),
                        )
                      }
                    />
                    <label htmlFor={`batch-item-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{item.name}</span>
                        <span className="tabular text-xs text-slate-500">
                          {formatKg(item.inspection?.actualWeightKg)} · grade {item.inspection?.qualityGrade ?? '—'}
                        </span>
                      </span>
                      <span className="block text-xs text-slate-500">
                        {item.itemCode} · {item.category?.name} ·{' '}
                        {item.inspection?.processingPath
                          ? PATH_LABELS[item.inspection.processingPath] ?? humanize(item.inspection.processingPath)
                          : 'path not set'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-slate-500">
            The batch is created as a draft. Mark it ready, attach a recycler and release it from the batch page.
          </p>
        </div>
      </Modal>
    </>
  );
}
