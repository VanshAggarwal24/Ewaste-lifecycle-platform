import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { hashPassword } from '../utils/password';
import { buildSearchFilter } from '../utils/queryFilters';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../schemas/user.schema';
import { getPublicUser } from './auth.service';

/**
 * Administrative user management + agent/recycler directory listings.
 */

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  city: true,
  state: true,
  staffedCenterId: true,
  lastLoginAt: true,
  createdAt: true,
  staffedCenter: { select: { id: true, name: true, code: true } },
  agentProfile: {
    select: {
      id: true,
      centerId: true,
      isAvailable: true,
      isVerified: true,
      currentLoadCount: true,
      maxDailyPickups: true,
      ratingAvg: true,
      vehicleCapacityKg: true,
      center: { select: { id: true, name: true, code: true } },
    },
  },
  recyclerProfile: {
    select: {
      id: true,
      organizationName: true,
      licenseNumber: true,
      acceptedMaterials: true,
      maxCapacityKg: true,
      isActive: true,
    },
  },
} as const;

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: buildSearchFilter(query.search, ['fullName', 'email', 'phone']),
        }
      : {}),
  };

  const orderBy: Prisma.UserOrderByWithRelationInput =
    query.sortBy === 'name'
      ? { fullName: query.sortOrder }
      : query.sortBy === 'role'
        ? { role: query.sortOrder }
        : { createdAt: query.sortOrder };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SUMMARY_SELECT,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SUMMARY_SELECT });
  if (!user) throw new NotFoundError('User');
  return user;
}

/** Detailed view used by the admin user drawer: adds counts of the user's records. */
export async function getUserDetail(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...USER_SUMMARY_SELECT,
      _count: { select: { submittedItems: true, submittedRequests: true, recoveryRecords: true } },
    },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}

/**
 * Creates a user with any role — the privileged path that public registration lacks.
 * Only reachable behind `requireRole('ADMIN')`.
 */
export async function createUser(input: CreateUserInput, actorId: number) {
  const email = input.email.toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ConflictError('A user with this email address already exists');
  }

  if (input.staffedCenterId) {
    await assertCenterExists(input.staffedCenterId);
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName,
        phone: input.phone ?? null,
        role: input.role,
        status: input.status,
        staffedCenterId: input.role === 'CENTER_STAFF' ? (input.staffedCenterId ?? null) : null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        pincode: input.pincode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      },
      select: { id: true, role: true },
    });

    // Profile rows are created in the same transaction: a COLLECTION_AGENT without an
    // agent profile could never be assigned a pickup, so the half state must not exist.
    if (input.role === 'COLLECTION_AGENT' && input.agentProfile) {
      await tx.agentProfile.create({
        data: {
          userId: user.id,
          centerId: input.agentProfile.centerId ?? null,
          vehicleType: input.agentProfile.vehicleType ?? null,
          vehicleCapacityKg: input.agentProfile.vehicleCapacityKg,
          maxDailyPickups: input.agentProfile.maxDailyPickups,
          isAvailable: input.agentProfile.isAvailable,
          isVerified: input.agentProfile.isVerified,
        },
      });
    }

    if (input.role === 'RECYCLER' && input.recyclerProfile) {
      await tx.recyclerProfile.create({
        data: {
          userId: user.id,
          organizationName: input.recyclerProfile.organizationName,
          licenseNumber: input.recyclerProfile.licenseNumber,
          acceptedMaterials: input.recyclerProfile.acceptedMaterials,
          maxCapacityKg: input.recyclerProfile.maxCapacityKg,
          isActive: input.recyclerProfile.isActive,
          contactPhone: input.recyclerProfile.contactPhone ?? null,
        },
      });
    }

    return user;
  });

  // `actorId` is recorded for audit purposes in the response and logs.
  return { ...(await getUserDetail(created.id)), createdBy: actorId };
}

export async function updateUser(id: number, input: UpdateUserInput, actor: { id: number; role: Role }) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, agentProfile: { select: { id: true } }, recyclerProfile: { select: { id: true } } },
  });
  if (!target) throw new NotFoundError('User');

  // An administrator must not be able to lock themselves out of the platform.
  if (id === actor.id && input.role && input.role !== 'ADMIN') {
    throw new ForbiddenError('You cannot change your own role');
  }
  if (id === actor.id && input.status === 'SUSPENDED') {
    throw new ForbiddenError('You cannot suspend your own account');
  }

  // Demotion guard: the database trigger would reject these anyway; failing here produces
  // a far more actionable message.
  if (input.role && input.role !== target.role) {
    if (target.role === 'COLLECTION_AGENT' && target.agentProfile && input.role !== 'COLLECTION_AGENT') {
      throw new ConflictError(
        'This user still has a collection-agent profile. Change the role only after the agent profile is removed.',
      );
    }
    if (target.role === 'RECYCLER' && target.recyclerProfile && input.role !== 'RECYCLER') {
      throw new ConflictError(
        'This user still has a recycler profile. Change the role only after the recycler profile is removed.',
      );
    }

    // Promoting to a privileged profile role in-place is not supported here: it would
    // create a user whose role and profile disagree. Use POST /api/users for that.
    if (input.role === 'COLLECTION_AGENT' || input.role === 'RECYCLER') {
      throw new ConflictError(
        `${input.role} accounts are created with POST /api/users so that the matching profile is created atomically.`,
      );
    }
  }

  if (input.staffedCenterId) await assertCenterExists(input.staffedCenterId);

  if (id === actor.id && input.role === undefined) {
    // Self-edits are allowed for benign fields only (already guarded above).
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.staffedCenterId !== undefined ? { staffedCenterId: input.staffedCenterId } : {}),
      ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    },
    select: { id: true },
  });

  return getUserDetail(id);
}

export async function resetUserPassword(id: number, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new NotFoundError('User');

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
    select: { id: true },
  });

  return { message: 'Password reset successfully' };
}

export async function suspendUser(id: number, actorId: number) {
  if (id === actorId) throw new ForbiddenError('You cannot suspend your own account');
  return updateUser(id, { status: 'SUSPENDED' }, { id: actorId, role: 'ADMIN' });
}

export async function activateUser(id: number) {
  return updateUser(id, { status: 'ACTIVE' }, { id: 0, role: 'ADMIN' });
}

/**
 * Hard delete. Refused when the user still owns lifecycle records — deleting them would
 * destroy the audit trail of physical e-waste, so suspension is the correct action there.
 */
export async function deleteUser(id: number, actorId: number) {
  if (id === actorId) throw new ForbiddenError('You cannot delete your own account');

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      _count: {
        select: {
          submittedItems: true,
          submittedRequests: true,
          historyEvents: true,
          recoveryRecords: true,
        },
      },
    },
  });
  if (!user) throw new NotFoundError('User');

  const dependencies =
    user._count.submittedItems +
    user._count.submittedRequests +
    user._count.historyEvents +
    user._count.recoveryRecords;

  if (dependencies > 0) {
    throw new ConflictError(
      'This user has lifecycle records and cannot be deleted without destroying the audit trail. Suspend the account instead.',
      { dependentRecords: dependencies },
    );
  }

  await prisma.user.delete({ where: { id } });
  return { message: 'User deleted' };
}

// ---------------------------------------------------------------------------------------
// Directories used by the assignment UI and batch release UI
// ---------------------------------------------------------------------------------------

export async function listAgents(options: { centerId?: number; onlyAvailable?: boolean } = {}) {
  const agents = await prisma.agentProfile.findMany({
    where: {
      ...(options.centerId ? { centerId: options.centerId } : {}),
      ...(options.onlyAvailable ? { isAvailable: true } : {}),
    },
    select: {
      id: true,
      currentLoadCount: true,
      maxDailyPickups: true,
      isAvailable: true,
      isVerified: true,
      ratingAvg: true,
      vehicleType: true,
      vehicleCapacityKg: true,
      center: { select: { id: true, name: true, code: true, city: true, latitude: true, longitude: true } },
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      },
    },
    orderBy: [{ isAvailable: 'desc' }, { currentLoadCount: 'asc' }],
  });

  // Flatten for the frontend, keeping the profile id and the user id distinct.
  return agents.map((agent) => ({
    agentProfileId: agent.id,
    userId: agent.user.id,
    fullName: agent.user.fullName,
    email: agent.user.email,
    phone: agent.user.phone,
    userStatus: agent.user.status,
    city: agent.center?.city ?? agent.user.city,
    latitude: agent.user.latitude ?? agent.center?.latitude ?? null,
    longitude: agent.user.longitude ?? agent.center?.longitude ?? null,
    center: agent.center,
    vehicleType: agent.vehicleType,
    vehicleCapacityKg: agent.vehicleCapacityKg,
    isAvailable: agent.isAvailable,
    isVerified: agent.isVerified,
    ratingAvg: agent.ratingAvg,
    currentLoadCount: agent.currentLoadCount,
    maxDailyPickups: agent.maxDailyPickups,
    utilizationPct:
      agent.maxDailyPickups > 0
        ? Math.round((agent.currentLoadCount / agent.maxDailyPickups) * 100)
        : 0,
  }));
}

export async function listRecyclers(options: { onlyActive?: boolean } = {}) {
  const recyclers = await prisma.recyclerProfile.findMany({
    where: options.onlyActive ? { isActive: true } : {},
    select: {
      id: true,
      organizationName: true,
      licenseNumber: true,
      acceptedMaterials: true,
      maxCapacityKg: true,
      isActive: true,
      contactPhone: true,
      user: { select: { id: true, fullName: true, email: true, phone: true, status: true, city: true } },
    },
    orderBy: { organizationName: 'asc' },
  });

  // Attach the live batch workload, which the release dialog displays.
  const workloads = await prisma.processingBatch.groupBy({
    by: ['recyclerId'],
    where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } },
    _count: { _all: true },
  });
  const workloadByUserId = new Map(
    workloads.filter((w) => w.recyclerId !== null).map((w) => [w.recyclerId as number, w._count._all]),
  );

  return recyclers.map((r) => ({
    id: r.id,
    userId: r.user.id,
    organizationName: r.organizationName,
    licenseNumber: r.licenseNumber,
    acceptedMaterials: r.acceptedMaterials,
    maxCapacityKg: r.maxCapacityKg,
    isActive: r.isActive,
    contactPhone: r.contactPhone ?? r.user.phone,
    contactName: r.user.fullName,
    email: r.user.email,
    userStatus: r.user.status,
    city: r.user.city,
    openBatches: workloadByUserId.get(r.user.id) ?? 0,
  }));
}

export async function updateAgentProfile(
  agentProfileId: number,
  input: {
    centerId?: number | null;
    vehicleType?: string | null;
    vehicleCapacityKg?: number;
    maxDailyPickups?: number;
    isAvailable?: boolean;
    isVerified?: boolean;
  },
) {
  const profile = await prisma.agentProfile.findUnique({ where: { id: agentProfileId }, select: { id: true } });
  if (!profile) throw new NotFoundError('Agent profile');

  if (input.centerId) await assertCenterExists(input.centerId);

  return prisma.agentProfile.update({
    where: { id: agentProfileId },
    data: input,
    select: {
      id: true,
      userId: true,
      centerId: true,
      vehicleType: true,
      vehicleCapacityKg: true,
      isAvailable: true,
      isVerified: true,
      maxDailyPickups: true,
      currentLoadCount: true,
    },
  });
}

export async function updateRecyclerProfile(
  recyclerProfileId: number,
  input: {
    organizationName?: string;
    licenseNumber?: string;
    acceptedMaterials?: Prisma.RecyclerProfileUpdateInput['acceptedMaterials'];
    maxCapacityKg?: number;
    isActive?: boolean;
    contactPhone?: string | null;
  },
) {
  const profile = await prisma.recyclerProfile.findUnique({ where: { id: recyclerProfileId }, select: { id: true } });
  if (!profile) throw new NotFoundError('Recycler profile');

  return prisma.recyclerProfile.update({
    where: { id: recyclerProfileId },
    data: input,
    select: {
      id: true,
      userId: true,
      organizationName: true,
      licenseNumber: true,
      acceptedMaterials: true,
      maxCapacityKg: true,
      isActive: true,
      contactPhone: true,
    },
  });
}

async function assertCenterExists(centerId: number) {
  const center = await prisma.collectionCenter.findUnique({ where: { id: centerId }, select: { id: true } });
  if (!center) throw new NotFoundError('Collection centre');
}

export { getPublicUser };
