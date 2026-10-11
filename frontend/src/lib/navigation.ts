import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Package,
  PlusCircle,
  Recycle,
  Tags,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';
import type { Role } from '@/api/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only render this link when the predicate passes (used for ADMIN's centre switch). */
  matchPrefixes?: string[];
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  USER: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/items', label: 'My items', icon: Package },
    { to: '/items/new', label: 'Submit e-waste', icon: PlusCircle },
    { to: '/pickups', label: 'My pickups', icon: Truck },
    { to: '/activity', label: 'Activity', icon: Activity },
  ],
  COLLECTION_AGENT: [
    { to: '/agent', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/agent/assignments', label: 'My assignments', icon: ClipboardList },
    { to: '/agent/history', label: 'Completed pickups', icon: Truck },
  ],
  CENTER_STAFF: [
    { to: '/center', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/center/incoming', label: 'Incoming pickups', icon: Truck },
    { to: '/center/inspections', label: 'Inspect & classify', icon: ClipboardList },
    { to: '/center/batches', label: 'Processing batches', icon: Boxes },
  ],
  RECYCLER: [
    { to: '/recycler', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/recycler/batches', label: 'Assigned batches', icon: Boxes },
    { to: '/recycler/recoveries', label: 'Material recovery', icon: Recycle },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/agents', label: 'Agents', icon: UserCog },
    { to: '/admin/centers', label: 'Collection centres', icon: Building2 },
    { to: '/admin/categories', label: 'Categories', icon: Tags },
    { to: '/admin/pickups', label: 'All pickups', icon: Truck },
    { to: '/admin/batches', label: 'All batches', icon: Boxes },
  ],
};

/** Secondary links rendered at the bottom of the sidebar for every role. */
export const ACCOUNT_NAV: NavItem[] = [{ to: '/profile', label: 'My profile', icon: UserCog }];
