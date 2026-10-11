import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, InvalidCredentialsError, NotFoundError } from '../lib/errors';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../utils/password';
import { signAuthToken } from '../utils/jwt';
import { toUtcDate } from '../schemas/common.schema';
import type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from '../schemas/auth.schema';

/**
 * Authentication and self-service account operations.
 */

/** Shape returned to clients for "the authenticated user". Never contains the hash. */
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  latitude: true,
  longitude: true,
  staffedCenterId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  staffedCenter: { select: { id: true, name: true, code: true, city: true } },
  agentProfile: {
    select: {
      id: true,
      centerId: true,
      vehicleType: true,
      vehicleCapacityKg: true,
      isAvailable: true,
      isVerified: true,
      currentLoadCount: true,
      maxDailyPickups: true,
      ratingAvg: true,
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
      contactPhone: true,
    },
  },
} as const;

export async function getPublicUser(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
  if (!user) throw new NotFoundError('User');
  return user;
}

/**
 * Public registration.
 *
 * The created account is ALWAYS a plain USER. The service accepts no role argument at all,
 * so there is no code path through which a self-registered account could become
 * privileged — privilege is granted only by an administrator or the seed script.
 */
export async function register(input: RegisterInput) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new ConflictError('An account with this email address already exists');
  }

  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) {
    throw new ForbiddenError(`Password ${policy.problems.join(', ')}`);
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: 'USER', // hard-coded: never taken from client input
      status: 'ACTIVE',
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
    select: PUBLIC_USER_SELECT,
  });

  const token = signAuthToken({ id: created.id, role: created.role as Role, email: created.email });
  return { token, user: created };
}

export async function login(input: LoginInput, meta: { ip?: string } = {}) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true, email: true, passwordHash: true, role: true, status: true },
  });

  // Identical error for "unknown email" and "wrong password" so the endpoint cannot be
  // used to enumerate registered accounts.
  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    // Hash a dummy value when the user is unknown, keeping response timing comparable.
    if (!user) await verifyPassword(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw new InvalidCredentialsError();
  }

  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('This account has been suspended. Please contact an administrator.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: { id: true },
  });

  const publicUser = await getPublicUser(user.id);
  const token = signAuthToken({ id: user.id, role: user.role as Role, email: user.email });

  return { token, user: publicUser, meta };
}

export async function updateOwnProfile(userId: number, input: UpdateProfileInput) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...input,
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    },
    select: { id: true },
  });

  return getPublicUser(userId);
}

export async function changeOwnPassword(userId: number, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new NotFoundError('User');

  const currentOk = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!currentOk) throw new InvalidCredentialsError('Current password is incorrect');

  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new ConflictError('The new password must be different from the current password');
  }

  const policy = checkPasswordPolicy(input.newPassword);
  if (!policy.ok) throw new ForbiddenError(`Password ${policy.problems.join(', ')}`);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
    select: { id: true },
  });

  return { message: 'Password updated successfully' };
}

export { toUtcDate };
