import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/domain';
import { buttonClasses } from '@/components/ui';

function StatusScreen({
  code,
  title,
  message,
  icon,
}: {
  code: string;
  title: string;
  message: string;
  icon: React.ReactNode;
}) {
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : '/login';

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</span>
      <p className="mt-4 text-xs font-semibold tracking-widest text-slate-400 uppercase">{code}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link to={home} className={buttonClasses('primary', 'md')}>
          Go to my dashboard
        </Link>
        <Link to="/" className={buttonClasses('secondary', 'md', '')}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
    </div>
  );
}

/** 403 — authenticated but the API refuses this resource for the caller's role or ownership. */
export function ForbiddenPage() {
  return (
    <StatusScreen
      code="403"
      title="You do not have access to this page"
      message="Your account role does not include this screen, or the record belongs to another user. If you believe this is wrong, contact an EcoCycle administrator."
      icon={<ShieldAlert className="h-6 w-6" />}
    />
  );
}

/** 404 — unknown route or a record the caller may not see. */
export function NotFoundPage() {
  return (
    <StatusScreen
      code="404"
      title="We could not find that page"
      message="The link may be out of date, or the record may have been removed. Use the navigation to continue."
      icon={<Compass className="h-6 w-6" />}
    />
  );
}
