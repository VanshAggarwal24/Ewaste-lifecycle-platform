import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, PackagePlus, Plus, Trash2, Truck } from 'lucide-react';
import { ApiError } from '@/api/client';
import { categoryApi, itemApi } from '@/api/endpoints';
import { useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { dateInputValue } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui';

interface ItemRow {
  key: string;
  name: string;
  categoryId: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  quantity: string;
  estimatedWeightKg: string;
  description: string;
}

const emptyRow = (key: string): ItemRow => ({
  key,
  name: '',
  categoryId: '',
  brand: '',
  modelNumber: '',
  serialNumber: '',
  quantity: '1',
  estimatedWeightKg: '',
  description: '',
});

/**
 * Submission screen: one or more items, optionally with a pickup request booked in the same
 * transaction (`POST /api/items` accepts both). The address defaults to the profile address.
 */
export function SubmitItemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const categoriesFetcher = useCallback((signal: AbortSignal) => categoryApi.list({ isActive: 'true' }, signal), []);
  const { data: categories, loading, error, reload } = useResource(categoriesFetcher);

  const [rows, setRows] = useState<ItemRow[]>([emptyRow('row-1')]);
  const [bookPickup, setBookPickup] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const [pickup, setPickup] = useState({
    addressLine: user?.addressLine ?? '',
    city: user?.city ?? '',
    state: user?.state ?? '',
    pincode: user?.pincode ?? '',
    preferredDate: dateInputValue(1),
    timeSlot: '09:00-13:00',
    notes: '',
  });

  const createAction = useAction((payload: Record<string, unknown>) => itemApi.create(payload), {
    onError: (caught) => {
      setFormError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      toast.failure(caught, 'Could not submit these items');
    },
  });

  const updateRow = (key: string, patch: Partial<ItemRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => setRows((current) => [...current, emptyRow(`row-${Date.now()}`)]);
  const removeRow = (key: string) =>
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.key !== key)));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Client-side pre-flight so the user gets immediate feedback; the API validates again.
    const localErrors: Record<string, string> = {};
    rows.forEach((row, index) => {
      if (row.name.trim().length < 2) localErrors[`items.${index}.name`] = 'Describe the item (at least 2 characters)';
      if (!row.categoryId) localErrors[`items.${index}.categoryId`] = 'Select a category';
    });
    if (bookPickup) {
      if (pickup.addressLine.trim().length < 5) localErrors['pickup.addressLine'] = 'Provide the pickup address';
      if (pickup.city.trim().length < 2) localErrors['pickup.city'] = 'Provide the city';
      if (pickup.state.trim().length < 2) localErrors['pickup.state'] = 'Provide the state';
      if (pickup.pincode.trim().length < 4) localErrors['pickup.pincode'] = 'Provide a PIN code';
      if (!pickup.preferredDate) localErrors['pickup.preferredDate'] = 'Choose a preferred date';
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      toast.failure(new Error('Please correct the highlighted fields'), 'Incomplete form');
      return;
    }

    setFieldErrors({});

    const payload: Record<string, unknown> = {
      items: rows.map((row) => ({
        name: row.name.trim(),
        categoryId: Number(row.categoryId),
        quantity: Number(row.quantity || '1'),
        ...(row.brand.trim() ? { brand: row.brand.trim() } : {}),
        ...(row.modelNumber.trim() ? { modelNumber: row.modelNumber.trim() } : {}),
        ...(row.serialNumber.trim() ? { serialNumber: row.serialNumber.trim() } : {}),
        ...(row.description.trim() ? { description: row.description.trim() } : {}),
        ...(row.estimatedWeightKg.trim() ? { estimatedWeightKg: Number(row.estimatedWeightKg) } : {}),
      })),
    };

    if (bookPickup) {
      payload.pickup = {
        address: {
          addressLine: pickup.addressLine.trim(),
          city: pickup.city.trim(),
          state: pickup.state.trim(),
          pincode: pickup.pincode.trim(),
        },
        preferredDate: pickup.preferredDate,
        timeSlot: pickup.timeSlot,
        ...(pickup.notes.trim() ? { notes: pickup.notes.trim() } : {}),
      };
    }

    const result = await createAction.run(payload);
    if (!result) return;

    toast.success(
      result.pickupRequest
        ? `${result.items.length} item(s) submitted and pickup ${result.pickupRequest.requestCode} created`
        : `${result.items.length} item(s) submitted`,
    );
    navigate(result.pickupRequest ? `/pickups/${result.pickupRequest.id}` : '/items');
  }

  if (loading) return <LoadingBlock label="Loading categories…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const options = (categories?.data ?? []).map((category) => ({
    value: String(category.id),
    label: `${category.name} (hazard ${category.hazardLevel}/5)`,
  }));

  if (options.length === 0) {
    return (
      <EmptyState
        title="No active categories"
        description="An administrator must create at least one e-waste category before items can be submitted."
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PageHeader
        title="Submit e-waste"
        description="Register the devices you want to hand over. Add a pickup request to have them collected from your address."
      />

      <div className="space-y-6">
        <InlineError error={formError} />

        <Card>
          <CardHeader
            title="Items"
            subtitle="One row per distinct device. Quantity covers identical units."
            icon={<PackagePlus className="h-4 w-4" />}
            actions={
              <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addRow}>
                Add item
              </Button>
            }
          />
          <CardBody className="space-y-5">
            {rows.map((row, index) => (
              <fieldset key={row.key} className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-medium text-slate-700">Item {index + 1}</legend>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField
                    label="Item name"
                    name={`items.${index}.name`}
                    required
                    value={row.name}
                    error={fieldErrors[`items.${index}.name`]}
                    onChange={(event) => updateRow(row.key, { name: event.target.value })}
                    placeholder="Dell Latitude laptop"
                    className="sm:col-span-2"
                  />
                  <SelectField
                    label="Category"
                    name={`items.${index}.categoryId`}
                    required
                    value={row.categoryId}
                    error={fieldErrors[`items.${index}.categoryId`]}
                    placeholder="Select a category"
                    options={options}
                    onChange={(event) => updateRow(row.key, { categoryId: event.target.value })}
                  />
                  <TextField
                    label="Brand"
                    name={`items.${index}.brand`}
                    value={row.brand}
                    onChange={(event) => updateRow(row.key, { brand: event.target.value })}
                    placeholder="Dell"
                  />
                  <TextField
                    label="Model"
                    name={`items.${index}.modelNumber`}
                    value={row.modelNumber}
                    onChange={(event) => updateRow(row.key, { modelNumber: event.target.value })}
                    placeholder="Latitude 5420"
                  />
                  <TextField
                    label="Serial number"
                    name={`items.${index}.serialNumber`}
                    value={row.serialNumber}
                    onChange={(event) => updateRow(row.key, { serialNumber: event.target.value })}
                    placeholder="Optional"
                  />
                  <TextField
                    label="Quantity"
                    name={`items.${index}.quantity`}
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                  />
                  <TextField
                    label="Estimated weight (kg)"
                    name={`items.${index}.estimatedWeightKg`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={row.estimatedWeightKg}
                    onChange={(event) => updateRow(row.key, { estimatedWeightKg: event.target.value })}
                    placeholder="Optional — measured at the centre"
                    hint="The centre records the actual weight at inspection."
                  />
                </div>

                <TextAreaField
                  label="Notes for the collection agent"
                  name={`items.${index}.description`}
                  rows={2}
                  value={row.description}
                  onChange={(event) => updateRow(row.key, { description: event.target.value })}
                  placeholder="Access details, condition remarks, accessories included…"
                  className="mt-4"
                />

                {rows.length > 1 ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => removeRow(row.key)}
                    >
                      Remove item
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pickup request"
            subtitle="Assigning an eligible agent happens automatically once the request exists."
            icon={<Truck className="h-4 w-4" />}
          />
          <CardBody className="space-y-4">
            <CheckboxField
              label="Book a pickup for these items"
              name="bookPickup"
              checked={bookPickup}
              onChange={(event) => setBookPickup(event.target.checked)}
              hint="Uncheck to register items now and schedule collection later."
            />

            {bookPickup ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextAreaField
                  label="Pickup address"
                  name="pickup.addressLine"
                  required
                  rows={2}
                  value={pickup.addressLine}
                  error={fieldErrors['pickup.addressLine']}
                  onChange={(event) => setPickup((current) => ({ ...current, addressLine: event.target.value }))}
                  placeholder="Flat 4B, Green Meadows, Velachery"
                  className="sm:col-span-2 lg:col-span-3"
                />
                <TextField
                  label="City"
                  name="pickup.city"
                  required
                  value={pickup.city}
                  error={fieldErrors['pickup.city']}
                  onChange={(event) => setPickup((current) => ({ ...current, city: event.target.value }))}
                />
                <TextField
                  label="State"
                  name="pickup.state"
                  required
                  value={pickup.state}
                  error={fieldErrors['pickup.state']}
                  onChange={(event) => setPickup((current) => ({ ...current, state: event.target.value }))}
                />
                <TextField
                  label="PIN code"
                  name="pickup.pincode"
                  required
                  value={pickup.pincode}
                  error={fieldErrors['pickup.pincode']}
                  onChange={(event) => setPickup((current) => ({ ...current, pincode: event.target.value }))}
                />
                <TextField
                  label="Preferred date"
                  name="pickup.preferredDate"
                  type="date"
                  required
                  min={dateInputValue(0)}
                  value={pickup.preferredDate}
                  error={fieldErrors['pickup.preferredDate']}
                  onChange={(event) => setPickup((current) => ({ ...current, preferredDate: event.target.value }))}
                />
                <SelectField
                  label="Preferred time slot"
                  name="pickup.timeSlot"
                  value={pickup.timeSlot}
                  onChange={(event) => setPickup((current) => ({ ...current, timeSlot: event.target.value }))}
                  options={[
                    { value: '09:00-13:00', label: 'Morning (09:00–13:00)' },
                    { value: '13:00-17:00', label: 'Afternoon (13:00–17:00)' },
                    { value: '17:00-20:00', label: 'Evening (17:00–20:00)' },
                  ]}
                />
                <TextAreaField
                  label="Notes for the agent"
                  name="pickup.notes"
                  rows={2}
                  value={pickup.notes}
                  onChange={(event) => setPickup((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Gate code, landmark, preferred contact time…"
                  className="sm:col-span-2 lg:col-span-3"
                />
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link to="/items" className="text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </Link>
          <Button
            type="submit"
            size="lg"
            loading={createAction.running}
            icon={bookPickup ? <CalendarClock className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
          >
            {bookPickup ? 'Submit items and book pickup' : 'Submit items'}
          </Button>
        </div>
      </div>
    </form>
  );
}
