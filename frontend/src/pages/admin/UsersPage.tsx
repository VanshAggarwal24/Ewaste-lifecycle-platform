import { useCallback, useState } from 'react';
import { KeyRound, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { ApiError } from '@/api/client';
import { centerApi, userApi } from '@/api/endpoints';
import type { Role, UserRow } from '@/api/types';
import { useDebounced, useAction, useResource } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MATERIAL_LABELS, MATERIAL_OPTIONS, ROLE_LABELS, ROLES } from '@/lib/domain';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  RoleBadge,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  TextField,
  Th,
  Tr,
} from '@/components/ui';

const EMPTY_FORM = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  role: 'USER' as Role,
  city: '',
  state: '',
  staffedCenterId: '',
  // agent profile
  agentCenterId: '',
  vehicleType: '',
  vehicleCapacityKg: '50',
  maxDailyPickups: '10',
  isAvailable: true,
  isVerified: false,
  // recycler profile
  organizationName: '',
  licenseNumber: '',
  maxCapacityKg: '1000',
  contactPhone: '',
  acceptedMaterials: [] as string[],
};

/**
 * User administration.
 *
 * This is the only place (apart from the seed script) where privileged roles can be
 * created — public registration always yields a USER.
 */
export function UsersPage() {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const listFetcher = useCallback(
    (signal: AbortSignal) =>
      userApi.list(
        {
          page,
          limit: 20,
          ...(role ? { role } : {}),
          ...(status ? { status } : {}),
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
        signal,
      ),
    [page, role, status, debouncedSearch],
  );
  const { data, loading, error, reload } = useResource(listFetcher);

  const centersFetcher = useCallback((signal: AbortSignal) => centerApi.list(undefined, signal), []);
  const { data: centers } = useResource(centersFetcher, [createOpen]);

  const createAction = useAction((payload: Record<string, unknown>) => userApi.create(payload), {
    onError: (caught) => {
      setFormError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      toast.failure(caught, 'Could not create the account');
    },
  });
  const suspendAction = useAction((id: number) => userApi.suspend(id), {
    onError: (caught) => toast.failure(caught, 'Could not suspend the account'),
  });
  const activateAction = useAction((id: number) => userApi.activate(id), {
    onError: (caught) => toast.failure(caught, 'Could not activate the account'),
  });
  const resetAction = useAction((payload: { id: number; password: string }) =>
    userApi.resetPassword(payload.id, payload.password), {
    onError: (caught) => toast.failure(caught, 'Could not reset the password'),
  });
  const deleteAction = useAction((id: number) => userApi.remove(id), {
    onError: (caught) => toast.failure(caught, 'Could not delete the account'),
  });

  const rows = data?.data ?? [];
  const centerOptions = (centers?.data ?? []).map((center) => ({
    value: String(center.id),
    label: `${center.name} (${center.code})`,
  }));

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submitCreate() {
    setFormError(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {
      email: form.email.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      role: form.role,
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.city.trim() ? { city: form.city.trim() } : {}),
      ...(form.state.trim() ? { state: form.state.trim() } : {}),
    };

    if (form.role === 'CENTER_STAFF') {
      if (!form.staffedCenterId) {
        setFieldErrors({ staffedCenterId: 'Select the centre this staff member works at' });
        return;
      }
      payload.staffedCenterId = Number(form.staffedCenterId);
    }

    if (form.role === 'COLLECTION_AGENT') {
      payload.agentProfile = {
        ...(form.agentCenterId ? { centerId: Number(form.agentCenterId) } : {}),
        ...(form.vehicleType.trim() ? { vehicleType: form.vehicleType.trim() } : {}),
        vehicleCapacityKg: Number(form.vehicleCapacityKg || '50'),
        maxDailyPickups: Number(form.maxDailyPickups || '10'),
        isAvailable: form.isAvailable,
        isVerified: form.isVerified,
      };
    }

    if (form.role === 'RECYCLER') {
      payload.recyclerProfile = {
        organizationName: form.organizationName.trim(),
        licenseNumber: form.licenseNumber.trim(),
        acceptedMaterials: form.acceptedMaterials,
        maxCapacityKg: Number(form.maxCapacityKg || '1000'),
        ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
      };
    }

    const result = await createAction.run(payload);
    if (result) {
      toast.success(`${ROLE_LABELS[form.role]} account created`);
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM });
      reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Create and manage accounts. Privileged roles can only be granted here."
        actions={
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setFormError(null);
              setFieldErrors({});
              setCreateOpen(true);
            }}
          >
            New user
          </Button>
        }
      />

      <Card>
        <CardHeader title="Filters" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <TextField
              label="Search"
              name="userSearch"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name or email"
            />
            <Search className="pointer-events-none absolute top-9 right-3 h-4 w-4 text-slate-400" />
          </div>
          <SelectField
            label="Role"
            name="userRoleFilter"
            value={role}
            placeholder="All roles"
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            options={ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
          />
          <SelectField
            label="Status"
            name="userStatusFilter"
            value={status}
            placeholder="All statuses"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Accounts" subtitle={data?.meta ? `${formatNumber(data.meta.total)} records` : undefined} />

        {loading ? (
          <LoadingBlock label="Loading users…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No accounts match" description="Adjust the filters or create a new account." />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Attached to</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <span className="font-medium text-slate-800">{row.fullName}</span>
                      <span className="block text-xs text-slate-500">{row.email}</span>
                      {row.phone ? <span className="block text-xs text-slate-400">{row.phone}</span> : null}
                    </Td>
                    <Td>
                      <RoleBadge role={row.role} />
                    </Td>
                    <Td>
                      {row.staffedCenter?.name ??
                        row.agentProfile?.center?.name ??
                        row.recyclerProfile?.organizationName ??
                        (row.city ? `${row.city}` : '—')}
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</span>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        {row.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserX className="h-3.5 w-3.5" />}
                            disabled={row.id === currentUser?.id}
                            onClick={async () => {
                              const result = await suspendAction.run(row.id);
                              if (result) {
                                toast.success(`${row.fullName} suspended`);
                                reload();
                              }
                            }}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserCheck className="h-3.5 w-3.5" />}
                            onClick={async () => {
                              const result = await activateAction.run(row.id);
                              if (result) {
                                toast.success(`${row.fullName} activated`);
                                reload();
                              }
                            }}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<KeyRound className="h-3.5 w-3.5" />}
                          onClick={() => {
                            setResetTarget(row);
                            setNewPassword('');
                          }}
                        >
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          disabled={row.id === currentUser?.id}
                          onClick={() => setDeleteTarget(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------------- create modal */}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create account"
        description="Choose a role; profile-backed roles require their extra details."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createAction.running} onClick={submitCreate} icon={<ShieldCheck className="h-4 w-4" />}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineError error={formError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              name="newFullName"
              required
              value={form.fullName}
              error={fieldErrors.fullName}
              onChange={(event) => set('fullName', event.target.value)}
            />
            <TextField
              label="Email"
              name="newEmail"
              type="email"
              required
              value={form.email}
              error={fieldErrors.email}
              onChange={(event) => set('email', event.target.value)}
            />
            <TextField
              label="Temporary password"
              name="newPassword"
              type="password"
              required
              value={form.password}
              error={fieldErrors.password}
              onChange={(event) => set('password', event.target.value)}
              hint="At least 8 characters, with a letter and a digit."
            />
            <TextField
              label="Phone"
              name="newPhone"
              value={form.phone}
              error={fieldErrors.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
            <SelectField
              label="Role"
              name="newRole"
              value={form.role}
              onChange={(event) => set('role', event.target.value as Role)}
              options={ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
            />
            <TextField
              label="City"
              name="newCity"
              value={form.city}
              error={fieldErrors.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </div>

          {form.role === 'CENTER_STAFF' ? (
            <SelectField
              label="Works at centre"
              name="staffedCenterId"
              value={form.staffedCenterId}
              error={fieldErrors.staffedCenterId}
              placeholder="Select a centre"
              options={centerOptions}
              onChange={(event) => set('staffedCenterId', event.target.value)}
            />
          ) : null}

          {form.role === 'COLLECTION_AGENT' ? (
            <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">Agent profile</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Home centre"
                  name="agentCenterId"
                  value={form.agentCenterId}
                  placeholder="No fixed centre"
                  options={centerOptions}
                  onChange={(event) => set('agentCenterId', event.target.value)}
                />
                <TextField
                  label="Vehicle type"
                  name="vehicleType"
                  value={form.vehicleType}
                  onChange={(event) => set('vehicleType', event.target.value)}
                  placeholder="Cargo van"
                />
                <TextField
                  label="Vehicle capacity (kg)"
                  name="vehicleCapacityKg"
                  type="number"
                  min="1"
                  value={form.vehicleCapacityKg}
                  onChange={(event) => set('vehicleCapacityKg', event.target.value)}
                />
                <TextField
                  label="Max daily pickups"
                  name="maxDailyPickups"
                  type="number"
                  min="1"
                  value={form.maxDailyPickups}
                  onChange={(event) => set('maxDailyPickups', event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckboxField
                  label="Available for assignment"
                  name="isAvailable"
                  checked={form.isAvailable}
                  onChange={(event) => set('isAvailable', event.target.checked)}
                />
                <CheckboxField
                  label="Verified"
                  name="isVerified"
                  checked={form.isVerified}
                  onChange={(event) => set('isVerified', event.target.checked)}
                  hint="Unverified agents are filtered out by the assignment engine."
                />
              </div>
            </fieldset>
          ) : null}

          {form.role === 'RECYCLER' ? (
            <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">Recycler profile</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Organisation"
                  name="organizationName"
                  required
                  value={form.organizationName}
                  error={fieldErrors.organizationName}
                  onChange={(event) => set('organizationName', event.target.value)}
                />
                <TextField
                  label="Licence number"
                  name="licenseNumber"
                  required
                  value={form.licenseNumber}
                  error={fieldErrors.licenseNumber}
                  onChange={(event) => set('licenseNumber', event.target.value)}
                />
                <TextField
                  label="Monthly capacity (kg)"
                  name="maxCapacityKg"
                  type="number"
                  min="1"
                  value={form.maxCapacityKg}
                  onChange={(event) => set('maxCapacityKg', event.target.value)}
                />
                <TextField
                  label="Contact phone"
                  name="contactPhone"
                  value={form.contactPhone}
                  onChange={(event) => set('contactPhone', event.target.value)}
                />
              </div>
              <div>
                <p className="field-label">Accepted materials</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {MATERIAL_OPTIONS.map((material) => (
                    <CheckboxField
                      key={material}
                      label={MATERIAL_LABELS[material] ?? material}
                      name={`material-${material}`}
                      checked={form.acceptedMaterials.includes(material)}
                      onChange={(event) =>
                        set(
                          'acceptedMaterials',
                          event.target.checked
                            ? [...form.acceptedMaterials, material]
                            : form.acceptedMaterials.filter((value) => value !== material),
                        )
                      }
                    />
                  ))}
                </div>
                {fieldErrors.acceptedMaterials ? (
                  <p className="field-error">{fieldErrors.acceptedMaterials}</p>
                ) : null}
              </div>
            </fieldset>
          ) : null}
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- reset password */}

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset password${resetTarget ? ` — ${resetTarget.fullName}` : ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={resetAction.running}
              onClick={async () => {
                if (!resetTarget) return;
                const result = await resetAction.run({ id: resetTarget.id, password: newPassword });
                if (result) {
                  toast.success(`Password reset for ${resetTarget.fullName}`);
                  setResetTarget(null);
                }
              }}
            >
              Reset password
            </Button>
          </>
        }
      >
        <TextField
          label="New password"
          name="adminNewPassword"
          type="password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          hint="The user is not notified automatically — share it through a secure channel."
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={deleteAction.running}
        title="Delete this account?"
        message={`${deleteTarget?.fullName ?? 'This user'} will be removed permanently. Accounts that own lifecycle records cannot be deleted — suspend them instead.`}
        confirmLabel="Delete account"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteAction.run(deleteTarget.id);
          if (result) {
            toast.success('Account deleted');
            setDeleteTarget(null);
            reload();
          }
        }}
      />

      <Card className="mt-6">
        <CardHeader title="Role notes" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((roleValue) => (
            <div key={roleValue} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <RoleBadge role={roleValue} />
                {roleValue === 'USER' ? <Badge tone="neutral">self-registration</Badge> : <Badge tone="warning">admin only</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {roleValue === 'USER'
                  ? 'Can be created by anyone through the public registration form.'
                  : 'May only be created from this screen or by the seed script.'}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
