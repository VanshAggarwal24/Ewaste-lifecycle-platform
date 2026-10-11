import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, PackageCheck, Recycle, ShieldCheck, Truck } from 'lucide-react';

/**
 * Two-column frame shared by the login and registration screens: a sustainability-themed
 * story panel on the left, the form on the right. On small screens the story collapses to
 * a compact header so the form stays above the fold.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const steps = [
    { icon: PackageCheck, label: 'Submit', text: 'A citizen registers e-waste items and books a pickup.' },
    { icon: Truck, label: 'Collect', text: 'An eligible agent is assigned by a deterministic scoring rule.' },
    { icon: ShieldCheck, label: 'Inspect', text: 'Centre staff weigh, grade and choose a processing path.' },
    { icon: Recycle, label: 'Recover', text: 'Batch-level material recovery is recorded against the batch.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Story panel */}
      <div className="relative overflow-hidden bg-brand-800 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-center lg:py-16">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Leaf className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-tight">EcoCycle</span>
              <span className="block text-xs text-brand-200">E-waste lifecycle management platform</span>
            </span>
          </Link>

          <h2 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">
            Every device traced from doorstep to recovered material.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-brand-100">
            EcoCycle is a full-stack, database-backed platform. Each stage of the journey is a committed
            transaction with an immutable status history — nothing on a dashboard is estimated.
          </p>

          <ul className="mt-8 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-100 ring-1 ring-white/15">
                  <step.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {index + 1}. {step.label}
                  </p>
                  <p className="text-xs text-brand-200">{step.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-600">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
