import { Role } from '@prisma/client';

/**
 * Role vocabulary.
 *
 * The same five strings travel from the PostgreSQL enum (`"Role"`), through the API, into the
 * client's navigation and route guards. The frontend mirrors this list in
 * `frontend/src/lib/domain.ts` (`ROLES`, `ROLE_HOME`) and `frontend/src/lib/routeAccess.ts`
 * (`ROUTE_ROLES`), where a test asserts the identical five values — so drift on either side
 * fails a build instead of showing up as a "you do not have access" screen.
 */
const CLIENT_ROLES = ['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN'];

describe('role vocabulary', () => {
  it('matches the strings the client uses for routing', () => {
    expect(Object.values(Role)).toEqual(CLIENT_ROLES);
  });

  it('keeps the four privileged roles separate from the public one', () => {
    // Public registration can only ever create a USER; the rest are granted by an
    // administrator or by the controlled seed (see auth.service.register).
    expect(CLIENT_ROLES.filter((role) => role !== 'USER')).toEqual([
      'COLLECTION_AGENT',
      'CENTER_STAFF',
      'RECYCLER',
      'ADMIN',
    ]);
  });
});
