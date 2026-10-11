import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/domain';
import { Button, InlineError, TextField } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { DemoAccountsPanel } from './DemoAccountsPanel';

/**
 * Sign-in screen. On success the user is sent to the home screen for their role (or back
 * to whichever protected page they were trying to open).
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const user = await login(email.trim(), password);
      const destination = redirectTo && redirectTo !== '/login' ? redirectTo : ROLE_HOME[user.role];
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your EcoCycle account. Privileged roles are granted by an administrator, never by self-registration."
      footer={
        <>
          New to EcoCycle?{' '}
          <Link to="/register" className="link">
            Create a citizen account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <InlineError error={error} />

        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />

        <Button type="submit" fullWidth size="lg" loading={busy} icon={<LogIn className="h-4 w-4" />}>
          Sign in
        </Button>
      </form>

      <DemoAccountsPanel />
    </AuthShell>
  );
}
