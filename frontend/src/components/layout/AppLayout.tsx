import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Leaf, LogOut, Menu, Recycle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ACCOUNT_NAV, NAV_BY_ROLE, type NavItem } from '@/lib/navigation';
import { ROLE_LABELS } from '@/lib/domain';
import { initials } from '@/lib/format';
import { RoleBadge } from '@/components/ui';

/**
 * Application shell: brand header, role-aware navigation and the routed page body.
 * The sidebar collapses into a drawer on small screens.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = useMemo<NavItem[]>(() => {
    if (!user) return [];
    return [...NAV_BY_ROLE[user.role], ...ACCOUNT_NAV];
  }, [user]);

  if (!user) return null;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Recycle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">EcoCycle</p>
          <p className="text-[11px] text-brand-200">E-waste lifecycle platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/items' || item.to === '/pickups' || item.to === '/agent'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-700/60 text-white' : 'text-brand-100 hover:bg-brand-700/40 hover:text-white'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-brand-700/60 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {initials(user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
            <p className="truncate text-[11px] text-brand-200">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-brand-100 transition hover:bg-brand-700/60 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-brand-800 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw] bg-brand-800 shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-1.5 text-brand-100 hover:bg-brand-700/60"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <Leaf className="h-5 w-5 text-brand-600" />
              <span className="text-sm font-semibold text-slate-900">EcoCycle</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <RoleBadge role={user.role} />
            <span className="hidden text-sm text-slate-600 sm:inline">{user.fullName}</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 sm:px-6">
          EcoCycle — database-driven e-waste lifecycle management. Every figure on this screen is read from PostgreSQL.
        </footer>
      </div>
    </div>
  );
}
