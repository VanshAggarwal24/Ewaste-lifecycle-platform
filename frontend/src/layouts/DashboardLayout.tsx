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

  const Sidebar = ({ mobile = false }) => (
    <aside
      className={`flex flex-col h-full ${mobile ? 'w-64' : 'w-64'}`}
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center pulse-green"
          style={{ background: 'var(--color-primary)' }}>
          <Leaf size={18} color="white" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none" style={{ color: 'var(--color-text)' }}>EcoCycle</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>E-Waste Platform</p>
        </div>
      </div>

      {/* User pill */}
      <div className="mx-4 mt-4 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{user?.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-primary-light)' }}>
          {user?.role?.replace('_', ' ')}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        {navItems.map((item) => {
          const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group"
              style={{
                background: active ? 'rgba(22,163,74,0.15)' : 'transparent',
                color: active ? 'var(--color-primary-light)' : 'var(--color-muted)',
                border: active ? '1px solid rgba(22,163,74,0.25)' : '1px solid transparent',
              }}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: '#f87171' }}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={() => setSidebarOpen(true)} style={{ color: 'var(--color-text)' }}>
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm" style={{ color: 'var(--color-primary-light)' }}>EcoCycle</span>
          <div />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
