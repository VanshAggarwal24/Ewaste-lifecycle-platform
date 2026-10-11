import type { Role } from '@/api/types';
import { ROLE_HOME } from './domain';

/**
 * Which roles may open which route.
 *
 * This is the single source of truth, shared by two consumers that must never disagree:
 *
 *   1. the route guards in `App.tsx` (`RequireRole`), and
 *   2. the post-login redirect (`LoginPage` → `safeDestination`).
 *
 * They used to be independent: the guard knew the allowed roles while the login page decided
 * where to send the visitor from `location.state.from` alone. A session that ended on, say,
 * `/center/incoming` left that path behind, so the next person to sign in was sent there even
 * when their role could not open it — an administrator landed on the 403 page with their own
 * name in the sidebar. Both now read the same table, so the two cannot drift apart.
 */
export const ROUTE_ROLES: Record<string, Role[]> = {
  // Citizen
  '/dashboard': ['USER'],
  '/items/new': ['USER', 'ADMIN'],

  // Collection agent
  '/agent': ['COLLECTION_AGENT'],
  '/agent/assignments': ['COLLECTION_AGENT'],
  '/agent/history': ['COLLECTION_AGENT'],

  // Collection centre
  '/center': ['CENTER_STAFF'],
  '/center/incoming': ['CENTER_STAFF'],
  '/center/inspections': ['CENTER_STAFF'],
  '/center/inspect/:id': ['CENTER_STAFF', 'ADMIN'],
  '/center/batches': ['CENTER_STAFF'],

  // Recycler
  '/recycler': ['RECYCLER'],
  '/recycler/batches': ['RECYCLER'],
  '/recycler/recoveries': ['RECYCLER'],

  // Administrator
  '/admin': ['ADMIN'],
  '/admin/analytics': ['ADMIN'],
  '/admin/users': ['ADMIN'],
  '/admin/agents': ['ADMIN'],
  '/admin/centers': ['ADMIN'],
  '/admin/categories': ['ADMIN'],
  '/admin/pickups': ['ADMIN'],
  '/admin/batches': ['ADMIN'],
};

/** Routes any signed-in role may open (records are still filtered by the API). */
const OPEN_ROUTES = [
  '/',
  '/activity',
  '/profile',
  '/forbidden',
  '/items',
  '/items/:id',
  '/pickups',
  '/pickups/:id',
  '/batches/:id',
];

function normalise(path: string): string {
  const [withoutQuery] = path.split(/[?#]/);
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Matches a concrete path against a pattern that may contain `:param` segments. */
function matches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
}

/**
 * `true` when `role` is allowed to open `path`.
 *
 * Unknown paths, and the credential screens, return `false`: a redirect target we do not
 * recognise is not somewhere to send a freshly authenticated user.
 */
export function canRoleOpenPath(role: Role, path: string): boolean {
  const target = normalise(path);
  if (target === '/login' || target === '/register') return false;

  for (const [pattern, roles] of Object.entries(ROUTE_ROLES)) {
    if (matches(pattern, target)) return roles.includes(role);
  }
  return OPEN_ROUTES.some((pattern) => matches(pattern, target));
}

/**
 * Where a signed-in user should land: the page they originally asked for when their role may
 * open it, otherwise the home screen for that role.
 */
export function safeDestination(role: Role, from?: string | null): string {
  if (from && canRoleOpenPath(role, from)) return normalise(from);
  return ROLE_HOME[role];
}
