import { useSandboxSafeForm } from '@/lib/formSubmission';
import { useState, type FormEvent } from 'react';
import { KeyRound, Save, UserCog } from 'lucide-react';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAction } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/domain';
import { formatDateTime } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  InlineError,
  PageHeader,
  RoleBadge,
  TextField,
} from '@/components/ui';

/** Self-service profile and password management. */
export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    addressLine: user?.addressLine ?? '',
    city: user?.city ?? '',
    state: user?.state ?? '',
    pincode: user?.pincode ?? '',
    latitude: user?.latitude === null || user?.latitude === undefined ? '' : String(user.latitude),
    longitude: user?.longitude === null || user?.longitude === undefined ? '' : String(user.longitude),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<unknown>(null);

  const profileAction = useAction(
    (payload: Record<string, unknown>) => authApi.updateProfile(payload),
    {
      onError: (caught) => {
        setError(caught);
        if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
        toast.failure(caught, 'Could not save your profile');
      },
    },
  );

  const passwordAction = useAction(
    (payload: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(payload.currentPassword, payload.newPassword),
    {
      onError: (caught) => {
        setPasswordError(caught);
        if (caught instanceof ApiError) setPasswordErrors(caught.fieldErrors);
        toast.failure(caught, 'Could not change your password');
      },
    },
  );

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || null,
      addressLine: form.addressLine.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      pincode: form.pincode.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
    };

    const result = await profileAction.run(payload);
    if (result) {
      toast.success('Profile updated');
      await refreshUser();
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setPasswordErrors({});
    const message = await passwordAction.run({
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
    });
    if (message) {
      toast.success(message);
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  }

  // Both forms work in frames that block native form submission (see lib/formSubmission.ts).
  const profileForm = useSandboxSafeForm(saveProfile);
  const passwordForm = useSandboxSafeForm(changePassword);

  if (!user) return null;

  return (
    <>
      <PageHeader title="My profile" description="Your contact details are used to prefill pickup requests and to reach you during collection." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Account" icon={<UserCog className="h-4 w-4" />} />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Role</span>
              <RoleBadge role={user.role} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>{user.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-800">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Member since</span>
              <span className="font-medium text-slate-800">{formatDateTime(user.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Last sign-in</span>
              <span className="font-medium text-slate-800">{formatDateTime(user.lastLoginAt)}</span>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {ROLE_DESCRIPTIONS[user.role] ?? ROLE_LABELS[user.role]}
            </p>
            {user.staffedCenter ? (
              <p className="text-xs text-slate-500">
                Attached centre: <span className="font-medium text-slate-700">{user.staffedCenter.name}</span>
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Contact & address" subtitle="Saved with your account" />
          <CardBody>
            <form {...profileForm} className="space-y-4" noValidate>
              <InlineError error={error} />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Full name"
                  name="fullName"
                  required
                  value={form.fullName}
                  error={fieldErrors.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                />
                <TextField
                  label="Phone"
                  name="phone"
                  value={form.phone}
                  error={fieldErrors.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="+91 98400 00000"
                />
              </div>

              <TextField
                label="Address"
                name="addressLine"
                value={form.addressLine}
                error={fieldErrors.addressLine}
                onChange={(event) => setForm((current) => ({ ...current, addressLine: event.target.value }))}
                placeholder="Flat 4B, Green Meadows, Velachery"
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="City"
                  name="city"
                  value={form.city}
                  error={fieldErrors.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
                <TextField
                  label="State"
                  name="state"
                  value={form.state}
                  error={fieldErrors.state}
                  onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                />
                <TextField
                  label="PIN code"
                  name="pincode"
                  value={form.pincode}
                  error={fieldErrors.pincode}
                  onChange={(event) => setForm((current) => ({ ...current, pincode: event.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Latitude"
                  name="latitude"
                  value={form.latitude}
                  error={fieldErrors.latitude}
                  onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))}
                  placeholder="13.0033"
                  hint="Optional — improves agent distance scoring."
                />
                <TextField
                  label="Longitude"
                  name="longitude"
                  value={form.longitude}
                  error={fieldErrors.longitude}
                  onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))}
                  placeholder="80.2550"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" loading={profileAction.running} icon={<Save className="h-4 w-4" />}>
                  Save profile
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6 max-w-2xl">
        <CardHeader title="Change password" subtitle="Passwords are hashed on the server; the plain value is never stored." icon={<KeyRound className="h-4 w-4" />} />
        <CardBody>
          <form {...passwordForm} className="space-y-4" noValidate>
            <InlineError error={passwordError} />
            <TextField
              label="Current password"
              name="currentPassword"
              type="password"
              required
              value={passwords.currentPassword}
              error={passwordErrors.currentPassword}
              onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="New password"
                name="newPassword"
                type="password"
                required
                value={passwords.newPassword}
                error={passwordErrors.newPassword}
                onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}
                hint="At least 8 characters, with a letter and a digit."
              />
              <TextField
                label="Confirm new password"
                name="confirmNewPassword"
                type="password"
                required
                value={passwords.confirmPassword}
                error={passwordErrors.confirmPassword}
                onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={passwordAction.running}>
                Update password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
