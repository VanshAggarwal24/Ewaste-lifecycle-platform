import jwt from 'jsonwebtoken';
import { haversineDistanceKm, isValidCoordinates, pincodeCentroid, round } from '../../src/utils/geo';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../../src/utils/password';
import { extractBearerToken, signAuthToken, verifyAuthToken } from '../../src/utils/jwt';
import { serialize, stripSensitiveFields } from '../../src/utils/serialize';
import { Prisma } from '@prisma/client';

describe('password hashing', () => {
  it('never returns the plain text and verifies correctly', async () => {
    const hash = await hashPassword('CorrectHorse1');

    expect(hash).not.toContain('CorrectHorse1');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt identifier
    expect(await verifyPassword('CorrectHorse1', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces a different hash every time (unique salt per password)', async () => {
    const [a, b] = await Promise.all([hashPassword('SamePassword1'), hashPassword('SamePassword1')]);
    expect(a).not.toEqual(b);
    expect(await verifyPassword('SamePassword1', a)).toBe(true);
    expect(await verifyPassword('SamePassword1', b)).toBe(true);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await verifyPassword('anything', 'not-a-bcrypt-hash')).toBe(false);
  });

  describe('policy', () => {
    it('accepts a compliant password', () => {
      expect(checkPasswordPolicy('GoodPass123').ok).toBe(true);
    });

    it.each([
      ['short1', /at least 8 characters/],
      ['alllettersonly', /at least one digit/],
      ['12345678', /at least one letter/],
    ])('rejects %s', (password, expected) => {
      const result = checkPasswordPolicy(password);
      expect(result.ok).toBe(false);
      expect(result.problems.join(' ')).toMatch(expected);
    });
  });
});

describe('JWT handling', () => {
  const user = { id: 42, role: 'USER' as const, email: 'user@test.local' };

  it('signs a token containing only non-sensitive claims', () => {
    const token = signAuthToken(user);
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded.sub).toBe('42');
    expect(decoded.role).toBe('USER');
    expect(decoded.email).toBe('user@test.local');
    expect(decoded).not.toHaveProperty('passwordHash');
    expect(decoded).not.toHaveProperty('password');
  });

  it('round-trips through verification', () => {
    const payload = verifyAuthToken(signAuthToken(user));
    expect(payload.sub).toBe('42');
    expect(payload.role).toBe('USER');
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: '42', role: 'ADMIN', email: 'x@y.z' }, 'a-different-secret-entirely');
    expect(() => verifyAuthToken(forged)).toThrow('Invalid authentication token');
  });

  it('rejects a tampered payload', () => {
    const token = signAuthToken(user);
    const [header, , signature] = token.split('.');
    const tampered = jwt.sign({ sub: '42', role: 'ADMIN', email: 'user@test.local' }, 'test-suite-secret-value-should-be-long-enough');
    const parts = tampered.split('.');
    const mutant = `${header}.${parts[1]}.${signature}`;

    expect(() => verifyAuthToken(mutant)).toThrow(/Invalid authentication token/);
  });

  it('rejects an expired token with a dedicated message', () => {
    const expired = jwt.sign({ sub: '42', role: 'USER', email: 'u@t.l' }, process.env.JWT_SECRET as string, {
      expiresIn: '-1s',
    });
    expect(() => verifyAuthToken(expired)).toThrow(/Session expired/);
  });

  it('rejects a token with no subject', () => {
    const noSub = jwt.sign({ role: 'USER' }, process.env.JWT_SECRET as string);
    expect(() => verifyAuthToken(noSub)).toThrow();
  });

  describe('bearer extraction', () => {
    it('extracts a well-formed header', () => {
      expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
      expect(extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('returns null for missing or malformed headers', () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken('')).toBeNull();
      expect(extractBearerToken('Basic abc')).toBeNull();
      expect(extractBearerToken('Bearer')).toBeNull();
      expect(extractBearerToken('Bearer   ')).toBeNull();
    });
  });
});

describe('geospatial helpers', () => {
  it('computes a known great-circle distance (Chennai → Bengaluru ≈ 290 km)', () => {
    const distance = haversineDistanceKm(
      { latitude: 13.0827, longitude: 80.2707 },
      { latitude: 12.9716, longitude: 77.5946 },
    );
    expect(distance).toBeGreaterThan(280);
    expect(distance).toBeLessThan(300);
  });

  it('returns zero for identical points and is symmetric', () => {
    const p = { latitude: 13, longitude: 80 };
    const q = { latitude: 12, longitude: 78 };
    expect(haversineDistanceKm(p, p)).toBe(0);
    expect(haversineDistanceKm(p, q)).toBeCloseTo(haversineDistanceKm(q, p) as number, 10);
  });

  it('returns null when a point is missing or invalid, instead of guessing', () => {
    expect(haversineDistanceKm(null, { latitude: 1, longitude: 1 })).toBeNull();
    expect(haversineDistanceKm({ latitude: 1, longitude: 1 }, undefined)).toBeNull();
    expect(haversineDistanceKm({ latitude: 999, longitude: 1 }, { latitude: 1, longitude: 1 })).toBeNull();
  });

  it('validates coordinate ranges', () => {
    expect(isValidCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
    expect(isValidCoordinates({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinates({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidCoordinates({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });

  it('derives a deterministic in-range centroid from a 6-digit pincode', () => {
    const first = pincodeCentroid('600032');
    const second = pincodeCentroid('600032');

    expect(first).toEqual(second);
    expect(first!.latitude).toBeGreaterThanOrEqual(8);
    expect(first!.latitude).toBeLessThanOrEqual(37);
    expect(first!.longitude).toBeGreaterThanOrEqual(68);
    expect(first!.longitude).toBeLessThanOrEqual(97);
  });

  it('rejects unusable pincodes rather than inventing a location', () => {
    expect(pincodeCentroid(null)).toBeNull();
    expect(pincodeCentroid('n/a')).toBeNull();
    expect(pincodeCentroid('12345')).toBeNull();
  });

  it('rounds to the requested precision', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.23556, 3)).toBe(1.236);
  });
});

describe('response serialisation', () => {
  it('converts Prisma Decimal values into plain numbers', () => {
    const payload = {
      weightKg: new Prisma.Decimal('12.500'),
      nested: { latitude: new Prisma.Decimal('13.0067000') },
      list: [new Prisma.Decimal('1.25')],
      text: 'unchanged',
    };

    const result = serialize(payload);
    expect(result.weightKg).toBe(12.5);
    expect(typeof result.weightKg).toBe('number');
    expect(result.nested.latitude).toBeCloseTo(13.0067, 6);
    expect(result.list[0]).toBe(1.25);
    expect(result.text).toBe('unchanged');
  });

  it('never exposes a password hash even if a query selected it', () => {
    const payload = {
      id: 1,
      email: 'user@test.local',
      passwordHash: '$2a$10$super-secret-hash',
      nested: { password: 'plain-text', newPassword: 'x', jwtSecret: 'y', keep: 'ok' },
    };

    const result = stripSensitiveFields(payload) as Record<string, unknown>;
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.nested).not.toHaveProperty('password');
    expect(result.nested).not.toHaveProperty('newPassword');
    expect(result.nested).not.toHaveProperty('jwtSecret');
    expect((result.nested as Record<string, unknown>).keep).toBe('ok');
    expect(result.email).toBe('user@test.local');
  });

  it('handles arrays, null and primitives without altering them', () => {
    expect(stripSensitiveFields([{ passwordHash: 'x', id: 2 }])).toEqual([{ id: 2 }]);
    expect(stripSensitiveFields(null)).toBeNull();
    expect(stripSensitiveFields('text')).toBe('text');
  });
});
