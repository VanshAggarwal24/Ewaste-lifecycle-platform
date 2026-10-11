import { ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/domain';
import type { Role } from '@/api/types';

/**
 * Collapsible list of the accounts created by `backend/prisma/seed.ts`.
 * Documentation, not data: nothing here is used by the application logic.
 */
const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'ADMIN', email: 'admin@ecocycle.test' },
  { role: 'USER', email: 'user.priya@ecocycle.test' },
  { role: 'COLLECTION_AGENT', email: 'agent.chennai@ecocycle.test' },
  { role: 'CENTER_STAFF', email: 'staff.chennai@ecocycle.test' },
  { role: 'RECYCLER', email: 'recycler.greenmetals@ecocycle.test' },
];

export function DemoAccountsPanel() {
  return (
    <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
        <ChevronDown className="h-4 w-4" />
        Demo accounts created by the seed script
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Password for every seeded account: <code className="rounded bg-white px-1 py-0.5">Passw0rd123</code>
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-700">{ROLE_LABELS[account.role]}</span>
            <code className="rounded bg-white px-1 py-0.5">{account.email}</code>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        Also seeded: agent.bengaluru, staff.bengaluru, recycler.ecodismantle, user.vikram and user.sneha — same password.
      </p>
    </details>
  );
}
