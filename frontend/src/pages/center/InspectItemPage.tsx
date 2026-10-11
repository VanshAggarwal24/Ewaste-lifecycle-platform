import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck, Info, Save, Scale } from 'lucide-react';
import { ApiError } from '@/api/client';
import { itemApi } from '@/api/endpoints';
import { useAction, useResource } from '@/hooks/useApi';
import { useToast } from '@/context/ToastContext';
import { CONDITION_LABELS, CONDITION_OPTIONS, PATH_DESCRIPTIONS, PATH_LABELS, PATH_OPTIONS, gradeForScore } from '@/lib/domain';
import { formatDateTime, formatKg, humanize } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  ErrorState,
  GradeBadge,
  HazardBadge,
  InlineError,
  LoadingBlock,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
  buttonClasses,
} from '@/components/ui';

/**
 * Inspection and classification form.
 *
 * The quality grade is derived live from the score so the user sees exactly what the
 * database CHECK constraint will accept (A 85-100, B 70-84, C 50-69, D 0-49). Repairable
 * items cannot be routed to disposal — the API rejects that combination and the form warns
 * about it before submission.
 */
export function InspectItemPage() {
  const { id } = useParams<{ id: string }>();
  const itemId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();

  const itemFetcher = useCallback((signal: AbortSignal) => itemApi.get(itemId, signal), [itemId]);
  const { data: payload, loading, error, reload } = useResource(itemFetcher);

  const [form, setForm] = useState({
    condition: 'FAULTY',
    qualityScore: '60',
    actualWeightKg: '',
    processingPath: '',
    isRepairable: false,
    hazardFlag: false,
    dataWipeRequired: true,
    dataWipeDone: false,
    remarks: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const item = payload?.item;
  const score = Number(form.qualityScore || '0');
  const previewGrade = useMemo(() => (Number.isFinite(score) ? gradeForScore(score) : 'D'), [score]);

  const inspectAction = useAction(
    (body: Record<string, unknown>) => itemApi.inspect(itemId, body),
    {
      onError: (caught) => {
        setFormError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'Inspection rejected');
      },
    },
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const localErrors: Record<string, string> = {};
    if (!form.actualWeightKg.trim() || Number(form.actualWeightKg) <= 0) {
      localErrors.actualWeightKg = 'Record the measured weight';
    }
    if (!form.qualityScore.trim() || score < 0 || score > 100) {
      localErrors.qualityScore = 'Score must be between 0 and 100';
    }
    if (form.isRepairable && form.processingPath === 'DISPOSAL') {
      localErrors.processingPath = 'A repairable item cannot be routed to disposal';
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setFieldErrors({});

    const result = await inspectAction.run({
      condition: form.condition,
      qualityScore: score,
      actualWeightKg: Number(form.actualWeightKg),
      ...(form.processingPath ? { processingPath: form.processingPath } : {}),
      isRepairable: form.isRepairable,
      hazardFlag: form.hazardFlag,
      dataWipeRequired: form.dataWipeRequired,
      dataWipeDone: form.dataWipeDone,
      ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
    });

    if (result) {
      toast.success('Inspection recorded — the item is ready to be batched');
      navigate(`/items/${itemId}`);
    }
  }

  if (loading) return <LoadingBlock label="Loading item…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!item) return <EmptyState title="Item not found" />;

  if (item.status !== 'RECEIVED_AT_CENTER') {
    return (
      <EmptyState
        title="This item is not awaiting inspection"
        description={`Current status: ${humanize(item.status)}. Only items received at the centre can be inspected.`}
        action={
          <Link to={`/items/${itemId}`} className={buttonClasses('secondary', 'sm')}>
            Back to item
          </Link>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PageHeader
        title={`Inspect ${item.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{item.itemCode}</span>
            <span aria-hidden>·</span>
            <span>{item.category?.name}</span>
            {item.category ? <HazardBadge level={item.category.hazardLevel} /> : null}
            <span aria-hidden>·</span>
            <span>received {formatDateTime(item.updatedAt)}</span>
          </span>
        }
        actions={
          <Link to={`/items/${itemId}`} className={buttonClasses('secondary')}>
            Cancel
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <InlineError error={formError} />

          <Card>
            <CardHeader title="Condition & measurement" icon={<Scale className="h-4 w-4" />} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Physical condition"
                name="condition"
                required
                value={form.condition}
                onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))}
                options={CONDITION_OPTIONS.map((value) => ({ value, label: CONDITION_LABELS[value] ?? humanize(value) }))}
              />

              <TextField
                label="Measured weight (kg)"
                name="actualWeightKg"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.actualWeightKg}
                error={fieldErrors.actualWeightKg}
                onChange={(event) => setForm((current) => ({ ...current, actualWeightKg: event.target.value }))}
                hint={`Declared weight: ${formatKg(item.estimatedWeightKg)}`}
              />

              <TextField
                label="Quality score (0–100)"
                name="qualityScore"
                type="number"
                min={0}
                max={100}
                required
                value={form.qualityScore}
                error={fieldErrors.qualityScore}
                onChange={(event) => setForm((current) => ({ ...current, qualityScore: event.target.value }))}
                hint="Drives the letter grade stored in the database."
              />

              <div className="flex flex-col justify-end">
                <span className="field-label">Derived grade</span>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <GradeBadge grade={previewGrade} />
                  <span className="text-xs text-slate-500">
                    A ≥ 85 · B 70–84 · C 50–69 · D ≤ 49
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Processing path"
              subtitle="Leave empty to use the category default"
              icon={<ClipboardCheck className="h-4 w-4" />}
            />
            <CardBody className="space-y-4">
              <SelectField
                label="Determined path"
                name="processingPath"
                value={form.processingPath}
                error={fieldErrors.processingPath}
                placeholder={`Use category default${item.category?.defaultPath ? ` (${PATH_LABELS[item.category.defaultPath] ?? humanize(item.category.defaultPath)})` : ''}`}
                onChange={(event) => setForm((current) => ({ ...current, processingPath: event.target.value }))}
                options={PATH_OPTIONS.map((value) => ({ value, label: PATH_LABELS[value] ?? humanize(value) }))}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {PATH_OPTIONS.map((value) => (
                  <div key={value} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">{PATH_LABELS[value]}</p>
                    <p className="text-xs text-slate-500">{PATH_DESCRIPTIONS[value]}</p>
                  </div>
                ))}
              </div>

              <TextAreaField
                label="Remarks"
                name="remarks"
                rows={3}
                value={form.remarks}
                onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
                placeholder="Cracked screen, swollen battery, missing screws, data-bearing drive…"
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Flags" subtitle="Safety, reuse and data-handling checks" />
            <CardBody className="space-y-4">
              <CheckboxField
                label="Repairable"
                name="isRepairable"
                checked={form.isRepairable}
                onChange={(event) => setForm((current) => ({ ...current, isRepairable: event.target.checked }))}
                hint="Can the device be refurbished or repaired rather than dismantled?"
              />
              <CheckboxField
                label="Hazard flagged"
                name="hazardFlag"
                checked={form.hazardFlag}
                onChange={(event) => setForm((current) => ({ ...current, hazardFlag: event.target.checked }))}
                hint="Batteries, capacitors or other components needing special handling."
              />
              <CheckboxField
                label="Data wipe required"
                name="dataWipeRequired"
                checked={form.dataWipeRequired}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dataWipeRequired: event.target.checked,
                    dataWipeDone: event.target.checked ? current.dataWipeDone : false,
                  }))
                }
                hint="Storage-bearing devices must be sanitised before reuse."
              />
              <CheckboxField
                label="Data wipe completed"
                name="dataWipeDone"
                checked={form.dataWipeDone}
                disabled={!form.dataWipeRequired}
                onChange={(event) => setForm((current) => ({ ...current, dataWipeDone: event.target.checked }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Item summary" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Owner</span>
                <span className="font-medium text-slate-800">{item.user?.fullName ?? `#${item.userId}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Brand / model</span>
                <span className="font-medium text-slate-800">
                  {[item.brand, item.modelNumber].filter(Boolean).join(' ') || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Serial</span>
                <span className="font-medium text-slate-800">{item.serialNumber ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity</span>
                <span className="font-medium text-slate-800">{item.quantity}</span>
              </div>
              {item.pickupRequest ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Pickup</span>
                  <Link to={`/pickups/${item.pickupRequest.id}`} className="link">
                    {item.pickupRequest.requestCode}
                  </Link>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            One inspection per item is enforced by a unique constraint, and the grade/score pair is checked by the
            database itself.
          </p>

          <Button type="submit" fullWidth size="lg" loading={inspectAction.running} icon={<Save className="h-4 w-4" />}>
            Save inspection
          </Button>
        </div>
      </div>
    </form>
  );
}
