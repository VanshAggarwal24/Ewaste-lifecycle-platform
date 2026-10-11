import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck, Info, Package, Pencil, ShieldCheck, Trash2, Truck, XCircle } from 'lucide-react';
import { itemApi } from '@/api/endpoints';
import { useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { CONDITION_LABELS, PATH_LABELS } from '@/lib/domain';
import { formatDateTime, formatKg, humanize } from '@/lib/format';
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
  GradeBadge,
  HazardBadge,
  LoadingBlock,
  Modal,
  PageHeader,
  StatusBadge,
  TextAreaField,
  TextField,
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
 * Full record for one item: specifications, inspection outcome, batch membership and the
 * complete, database-backed lifecycle timeline.
 */
export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const itemId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const itemFetcher = useCallback((signal: AbortSignal) => itemApi.get(itemId, signal), [itemId]);
  const timelineFetcher = useCallback((signal: AbortSignal) => itemApi.timeline(itemId, signal), [itemId]);

  const { data: itemPayload, loading, error, reload } = useResource(itemFetcher);
  const { data: timeline, loading: timelineLoading, reload: reloadTimeline } = useResource(timelineFetcher);

  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', brand: '', modelNumber: '', description: '' });
  const [cancelReason, setCancelReason] = useState('');

  const item = itemPayload?.item;

  const refreshAll = () => {
    reload();
    reloadTimeline();
  };

  const updateAction = useAction((payload: Record<string, unknown>) => itemApi.update(itemId, payload), {
    onError: (caught) => toast.failure(caught, 'Could not update the item'),
  });
  const cancelAction = useAction((reason: string) => itemApi.cancel(itemId, reason), {
    onError: (caught) => toast.failure(caught, 'Could not cancel the item'),
  });
  const deleteAction = useAction(() => itemApi.remove(itemId), {
    onError: (caught) => toast.failure(caught, 'Could not delete the item'),
  });

  if (loading) return <LoadingBlock label="Loading item…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!item) return <EmptyState title="Item not found" />;

  const isOwner = user?.id === item.userId;
  const canEdit = isOwner && item.status === 'SUBMITTED';
  const canCancel = isOwner && ['SUBMITTED', 'PICKUP_SCHEDULED', 'COLLECTED'].includes(item.status);
  const canDelete = isOwner && item.status === 'SUBMITTED' && !item.pickupRequestId;
  const canInspect =
    (user?.role === 'CENTER_STAFF' || user?.role === 'ADMIN') && item.status === 'RECEIVED_AT_CENTER';

  const inspection = item.inspection;

  return (
    <>
      <PageHeader
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{item.itemCode}</span>
            <span aria-hidden>·</span>
            <StatusBadge status={item.status} />
            {item.category ? <HazardBadge level={item.category.hazardLevel} /> : null}
          </span>
        }
        actions={
          <>
            {canInspect ? (
              <Link to={`/center/inspect/${item.id}`} className={buttonClasses('primary')}>
                <ClipboardCheck className="h-4 w-4" />
                Inspect &amp; classify
              </Link>
            ) : null}
            {canEdit ? (
              <Button
                variant="secondary"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => {
                  setEditForm({
                    name: item.name,
                    brand: item.brand ?? '',
                    modelNumber: item.modelNumber ?? '',
                    description: item.description ?? '',
                  });
                  setEditOpen(true);
                }}
              >
                Edit
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="ghost"
                icon={<XCircle className="h-4 w-4" />}
                onClick={() => setCancelOpen(true)}
              >
                Cancel item
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Item details" icon={<Package className="h-4 w-4" />} />
          <CardBody>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <DetailRow label="Category" value={item.category?.name} />
                <DetailRow label="Brand" value={item.brand} />
                <DetailRow label="Model" value={item.modelNumber} />
                <DetailRow label="Serial number" value={item.serialNumber} />
                <DetailRow label="Quantity" value={item.quantity} />
                <DetailRow label="Declared weight" value={formatKg(item.estimatedWeightKg)} />
              </div>
              <div>
                <DetailRow label="Owner" value={item.user?.fullName ?? `User #${item.userId}`} />
                <DetailRow label="Submitted" value={formatDateTime(item.createdAt)} />
                <DetailRow
                  label="Pickup"
                  value={
                    item.pickupRequest ? (
                      <Link to={`/pickups/${item.pickupRequest.id}`} className="link">
                        {item.pickupRequest.requestCode}
                      </Link>
                    ) : null
                  }
                />
                <DetailRow label="Held at" value={item.center?.name} />
                <DetailRow label="Last updated" value={formatDateTime(item.updatedAt)} />
              </div>
            </dl>

            {item.description ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{item.description}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Inspection"
            subtitle="Recorded by centre staff"
            icon={<ClipboardCheck className="h-4 w-4" />}
          />
          <CardBody>
            {inspection ? (
              <dl>
                <DetailRow label="Condition" value={CONDITION_LABELS[inspection.condition] ?? inspection.condition} />
                <DetailRow
                  label="Quality score"
                  value={
                    <span className="flex items-center justify-end gap-2">
                      <span className="tabular">{inspection.qualityScore}/100</span>
                      <GradeBadge grade={inspection.qualityGrade} />
                    </span>
                  }
                />
                <DetailRow label="Measured weight" value={formatKg(inspection.actualWeightKg)} />
                <DetailRow
                  label="Processing path"
                  value={PATH_LABELS[inspection.processingPath] ?? inspection.processingPath}
                />
                <DetailRow
                  label="Repairable"
                  value={inspection.isRepairable ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}
                />
                <DetailRow
                  label="Hazard flagged"
                  value={inspection.hazardFlag ? <Badge tone="danger">Yes</Badge> : <Badge>No</Badge>}
                />
                <DetailRow
                  label="Data wipe"
                  value={
                    !inspection.dataWipeRequired ? (
                      <Badge>Not required</Badge>
                    ) : inspection.dataWipeDone ? (
                      <Badge tone="success" icon={<ShieldCheck className="h-3 w-3" />}>
                        Completed
                      </Badge>
                    ) : (
                      <Badge tone="warning">Pending</Badge>
                    )
                  }
                />
                <DetailRow label="Inspected at" value={formatDateTime(inspection.inspectedAt)} />
                <DetailRow label="Inspected by" value={inspection.inspectedBy?.fullName} />
                {inspection.remarks ? (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{inspection.remarks}</p>
                ) : null}
              </dl>
            ) : (
              <EmptyState
                title="Not inspected yet"
                description="Centre staff record condition, grade, measured weight and the processing path after receipt."
              />
            )}
          </CardBody>
        </Card>
      </div>

      {item.batchItem ? (
        <Card className="mt-6">
          <CardHeader title="Processing batch" icon={<Truck className="h-4 w-4" />} />
          <CardBody>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <DetailRow
                  label="Batch"
                  value={
                    <Link to={`/batches/${item.batchItem.batch.id}`} className="link">
                      {item.batchItem.batch.batchCode}
                    </Link>
                  }
                />
                <DetailRow label="Batch status" value={<StatusBadge status={item.batchItem.batch.status} />} />
                <DetailRow label="Recycler" value={item.batchItem.batch.recycler?.fullName} />
              </div>
              <div>
                <DetailRow label="Path" value={item.batchItem.batch.processingPath ? humanize(item.batchItem.batch.processingPath) : null} />
                <DetailRow label="Added" value={formatDateTime(item.batchItem.addedAt)} />
                <DetailRow label="Weight at addition" value={formatKg(item.batchItem.weightAtAdditionKg)} />
              </div>
            </dl>
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Material recovery is recorded per batch, so the recovered quantities are available on the batch page.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader
          title="Lifecycle timeline"
          subtitle="Chronological events from the append-only status history"
        />
        <CardBody>
          {timelineLoading ? (
            <LoadingBlock label="Loading timeline…" rows={4} />
          ) : (
            <Timeline events={timeline?.data ?? []} />
          )}
        </CardBody>
      </Card>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit item"
        description="Only editable while the item has not been handed over."
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
                  brand: editForm.brand.trim() || null,
                  modelNumber: editForm.modelNumber.trim() || null,
                  description: editForm.description.trim() || null,
                });
                if (result) {
                  toast.success('Item updated');
                  setEditOpen(false);
                  refreshAll();
                }
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Item name"
            name="editName"
            value={editForm.name}
            onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
          />
          <TextField
            label="Brand"
            name="editBrand"
            value={editForm.brand}
            onChange={(event) => setEditForm((current) => ({ ...current, brand: event.target.value }))}
          />
          <TextField
            label="Model"
            name="editModel"
            value={editForm.modelNumber}
            onChange={(event) => setEditForm((current) => ({ ...current, modelNumber: event.target.value }))}
          />
          <TextAreaField
            label="Description"
            name="editDescription"
            value={editForm.description}
            onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this item"
        description="The item leaves the active workflow but stays in the record for auditing."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep item
            </Button>
            <Button
              variant="danger"
              loading={cancelAction.running}
              onClick={async () => {
                const result = await cancelAction.run(cancelReason.trim());
                if (result) {
                  toast.success('Item cancelled');
                  setCancelOpen(false);
                  refreshAll();
                }
              }}
            >
              Cancel item
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          name="cancelReason"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="No longer available, submitted by mistake…"
        />
        <p className="mt-3 text-xs text-slate-500">
          Items that are already part of a pickup request cannot be cancelled individually — cancel the pickup instead.
        </p>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={deleteAction.running}
        title="Delete this item?"
        message="This permanently removes the item record. Only items that never entered the pickup workflow can be deleted."
        confirmLabel="Delete item"
        onConfirm={async () => {
          const result = await deleteAction.run();
          if (result) {
            toast.success('Item deleted');
            navigate('/items');
          }
        }}
      />
    </>
  );
}
