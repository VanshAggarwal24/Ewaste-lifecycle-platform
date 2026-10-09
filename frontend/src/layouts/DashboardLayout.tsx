import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Package, Truck, Settings, LogOut,
  Menu, X, Leaf, Users, BarChart3, Factory, Recycle,
  ClipboardList, Archive, ChevronRight
} from 'lucide-react';

const roleNavItems: Record<string, { label: string; to: string; icon: React.ReactNode }[]> = {
  USER: [
    { label: 'Dashboard',      to: '/dashboard',      icon: <LayoutDashboard size={18} /> },
    { label: 'Submit E-Waste', to: '/submit',         icon: <Package size={18} /> },
    { label: 'My Items',       to: '/my-items',       icon: <Archive size={18} /> },
    { label: 'Track Item',     to: '/track',          icon: <Truck size={18} /> },
  ],
  COLLECTION_AGENT: [
    { label: 'Dashboard',      to: '/agent/dashboard',  icon: <LayoutDashboard size={18} /> },
    { label: 'My Pickups',     to: '/agent/pickups',    icon: <Truck size={18} /> },
  ],
  CENTER_STAFF: [
    { label: 'Dashboard',      to: '/center/dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'Incoming Items', to: '/center/incoming',  icon: <Package size={18} /> },
    { label: 'Inspections',    to: '/center/inspect',   icon: <ClipboardList size={18} /> },
    { label: 'Batches',        to: '/center/batches',   icon: <Factory size={18} /> },
  ],
  RECYCLER: [
    { label: 'Dashboard',      to: '/recycler/dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'My Batches',     to: '/recycler/batches',   icon: <Recycle size={18} /> },
  ],
  ADMIN: [
    { label: 'Dashboard',      to: '/admin/dashboard',  icon: <LayoutDashboard size={18} /> },
    { label: 'Users',          to: '/admin/users',      icon: <Users size={18} /> },
    { label: 'E-Waste',        to: '/admin/ewaste',     icon: <Package size={18} /> },
    { label: 'Pickups',        to: '/admin/pickups',    icon: <Truck size={18} /> },
    { label: 'Analytics',      to: '/admin/analytics',  icon: <BarChart3 size={18} /> },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = (user?.role ? roleNavItems[user.role] : undefined) ?? [];
  const handleLogout = () => { logout(); navigate('/login'); };

  const getInitials = (name?: string) => {
    if (!name) return 'EC';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getPageTitle = () => {
    const current = navItems.find(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/'));
    if (current) return current.label;
    if (location.pathname.startsWith('/track')) return 'Track Item';
    return 'Dashboard';
  };

  const Sidebar = ({ mobile = false }) => (
    <aside
      className={`flex flex-col h-full ${mobile ? 'w-72' : 'w-64'} select-none`}
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center pulse-green shadow-sm"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }}>
            <Leaf size={20} color="white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight" style={{ color: 'var(--color-text)' }}>EcoCycle</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">PRO</span>
            </div>
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>Lifecycle Platform</p>
          </div>
        </div>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg" style={{ color: 'var(--color-muted)' }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Role Pill */}
      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl flex items-center justify-between"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
            style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-primary-light)' }}>
            {getInitials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--color-text)' }}>{user?.name || 'User'}</p>
            <p className="text-[10px] font-medium tracking-wide uppercase mt-0.5 truncate" style={{ color: 'var(--color-primary-light)' }}>
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 mt-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase px-2 mb-2" style={{ color: 'var(--color-muted)' }}>Navigation</p>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.to || (item.to !== '/dashboard' && item.to !== '/agent/dashboard' && item.to !== '/center/dashboard' && item.to !== '/recycler/dashboard' && item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group"
              style={{
                background: active ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                color: active ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                border: active ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
              }}
            >
              <span className={`transition-colors ${active ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-400'}`}>
                {item.icon}
              </span>
              <span className="flex-1 font-medium">{item.label}</span>
              {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="p-4 mt-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-red-500/10 text-red-400 border border-transparent hover:border-red-500/20"
        >
          <div className="flex items-center gap-2.5">
            <LogOut size={16} />
            <span>Sign Out</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">v1.0</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-6 py-3.5 flex-shrink-0"
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">{getPageTitle()}</span>
              <span className="hidden sm:inline text-xs text-slate-500">/</span>
              <span className="hidden sm:inline text-xs text-slate-400 capitalize">{user?.role?.toLowerCase().replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
              style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--color-primary-light)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live System Online</span>
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-emerald-300 bg-emerald-950/80 border border-emerald-800/40">
                {getInitials(user?.name)}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-xs font-semibold leading-none text-slate-200">{user?.name?.split(' ')[0]}</p>
                <p className="text-[10px] text-slate-400 leading-none mt-1">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
