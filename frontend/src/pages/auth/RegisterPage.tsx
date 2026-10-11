import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/domain';
import { Button, InlineError, TextAreaField, TextField } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { DemoAccountsPanel } from './DemoAccountsPanel';

/**
 * Public registration.
 *
 * The form deliberately has no role selector: `POST /api/auth/register` creates a USER
 * account only, and the backend schema discards any role field a client might inject.
 */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    addressLine: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setFieldErrors({});
    setBusy(true);

    try {
      const user = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.addressLine.trim() ? { addressLine: form.addressLine.trim() } : {}),
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
        ...(form.state.trim() ? { state: form.state.trim() } : {}),
        ...(form.pincode.trim() ? { pincode: form.pincode.trim() } : {}),
      });
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Citizen accounts can submit e-waste and book pickups immediately."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in instead
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <InlineError error={error} />

        <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Self-registration always creates a <strong>Citizen</strong> account. Collection agent, centre staff,
            recycler and administrator accounts are provisioned by an EcoCycle administrator.
          </p>
        </div>

        <TextField
          label="Full name"
          name="fullName"
          required
          value={form.fullName}
          error={fieldErrors.fullName}
          onChange={update('fullName')}
          placeholder="Priya Raman"
        />

        <TextField
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          error={fieldErrors.email}
          onChange={update('email')}
          placeholder="you@example.com"
        />

        <TextField
          label="Phone (optional)"
          name="phone"
          value={form.phone}
          error={fieldErrors.phone}
          onChange={update('phone')}
          placeholder="+91 98400 00000"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            error={fieldErrors.password}
            onChange={update('password')}
            hint="At least 8 characters, with a letter and a digit."
          />
          <TextField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={form.confirmPassword}
            error={fieldErrors.confirmPassword}
            onChange={update('confirmPassword')}
          />
        </div>

        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Pickup address (optional)</legend>
          <p className="-mt-2 text-xs text-slate-500">
            Saved with your profile so a pickup request can be raised without retyping it.
          </p>

          <TextAreaField
            label="Address"
            name="addressLine"
            rows={2}
            value={form.addressLine}
            error={fieldErrors.addressLine}
            onChange={update('addressLine')}
            placeholder="Flat 4B, Green Meadows, Velachery"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="City"
              name="city"
              value={form.city}
              error={fieldErrors.city}
              onChange={update('city')}
              placeholder="Chennai"
            />
            <TextField
              label="State"
              name="state"
              value={form.state}
              error={fieldErrors.state}
              onChange={update('state')}
              placeholder="Tamil Nadu"
            />
            <TextField
              label="PIN code"
              name="pincode"
              value={form.pincode}
              error={fieldErrors.pincode}
              onChange={update('pincode')}
              placeholder="600042"
            />
          </div>
        </fieldset>

        <Button type="submit" fullWidth size="lg" loading={busy} icon={<UserPlus className="h-4 w-4" />}>
          Create account
        </Button>
      </form>

      <DemoAccountsPanel />
    </AuthShell>
  );
}
