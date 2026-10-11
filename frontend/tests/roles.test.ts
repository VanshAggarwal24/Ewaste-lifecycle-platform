import { describe, expect, it } from 'vitest';
import { ROLES, ROLE_HOME, ROLE_LABELS } from '@/lib/domain';
import { ROUTE_ROLES, canRoleOpenPath, safeDestination } from '@/lib/routeAccess';

/**
 * Role vocabulary and route access.
 *
 * The same five role strings travel from the PostgreSQL enum, through the API, into the
 * client's navigation — so they are pinned here. The route table is asserted against itself
 * as well: every role must be able to open its own home screen, which is exactly the
 * invariant that was broken when a role could be redirected to a page its guard refused.
 */

/** Mirrors the `Role` enum in backend/prisma/schema.prisma. */
const BACKEND_ROLES = ['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN'];

describe('role vocabulary', () => {
  it('matches the backend enum exactly', () => {
    expect(ROLES).toEqual(BACKEND_ROLES);
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...BACKEND_ROLES].sort());
    expect(Object.keys(ROLE_HOME).sort()).toEqual([...BACKEND_ROLES].sort());
  });

  it('gives every role a home screen its own guard allows', () => {
    for (const role of ROLES) {
      expect(canRoleOpenPath(role, ROLE_HOME[role]), `${role} → ${ROLE_HOME[role]}`).toBe(true);
      expect(safeDestination(role)).toBe(ROLE_HOME[role]);
    }
  });
});

describe('route access', () => {
  it('mirrors the route table used by the guards', () => {
    // Spot-check the mapping that decides who may open each dashboard.
    expect(ROUTE_ROLES['/dashboard']).toEqual(['USER']);
    expect(ROUTE_ROLES['/agent']).toEqual(['COLLECTION_AGENT']);
    expect(ROUTE_ROLES['/center']).toEqual(['CENTER_STAFF']);
    expect(ROUTE_ROLES['/recycler']).toEqual(['RECYCLER']);
    expect(ROUTE_ROLES['/admin']).toEqual(['ADMIN']);
  });

  it('refuses another role’s home screen and the credential screens', () => {
    expect(canRoleOpenPath('ADMIN', '/center/incoming')).toBe(false);
    expect(canRoleOpenPath('ADMIN', '/dashboard')).toBe(false);
    expect(canRoleOpenPath('USER', '/admin')).toBe(false);
    expect(canRoleOpenPath('RECYCLER', '/admin/users')).toBe(false);
    expect(canRoleOpenPath('ADMIN', '/login')).toBe(false);
    expect(canRoleOpenPath('USER', '/register')).toBe(false);
  });

  it('allows the shared screens for every role', () => {
    for (const role of ROLES) {
      for (const path of ['/', '/activity', '/profile', '/items', '/items/12', '/pickups', '/pickups/3', '/batches/9']) {
        expect(canRoleOpenPath(role, path), `${role} → ${path}`).toBe(true);
      }
    }
  });

  it('keeps parameterised routes working', () => {
    expect(canRoleOpenPath('CENTER_STAFF', '/center/inspect/42')).toBe(true);
    expect(canRoleOpenPath('ADMIN', '/center/inspect/42')).toBe(true);
    expect(canRoleOpenPath('RECYCLER', '/center/inspect/42')).toBe(false);
  });

  it('sends an unusable redirect target to the role home instead', () => {
    expect(safeDestination('ADMIN', '/center/incoming')).toBe('/admin');
    expect(safeDestination('ADMIN', '/recycler/batches')).toBe('/admin');
    expect(safeDestination('CENTER_STAFF', '/center/batches')).toBe('/center/batches');
    expect(safeDestination('USER', '/login')).toBe('/dashboard');
    expect(safeDestination('USER', '/not-a-real-page')).toBe('/dashboard');
    expect(safeDestination('COLLECTION_AGENT', '/center/incoming?tab=open')).toBe('/agent');
  });
});
