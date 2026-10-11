/**
 * Geospatial helpers used by the rule-based pickup assignment engine.
 *
 * Distances are great-circle (haversine) distances in kilometres on a spherical Earth.
 * This is accurate enough for city-scale pickup routing and needs no external service
 * or paid API.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinates(value: Partial<Coordinates> | null | undefined): value is Coordinates {
  return !!value && isValidLatitude(value.latitude) && isValidLongitude(value.longitude);
}

/**
 * Great-circle distance between two coordinates, in kilometres.
 * Returns `null` when either point is missing/invalid so callers must decide the fallback
 * explicitly instead of silently treating "unknown" as "zero distance".
 */
export function haversineDistanceKm(
  a: Partial<Coordinates> | null | undefined,
  b: Partial<Coordinates> | null | undefined,
): number | null {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return null;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounds to `dp` decimals without introducing floating point drift in comparisons. */
export function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Coarse fallback when precise coordinates are unavailable: pincode-level centroid.
 * Deliberately returns `null` when the pincode is unusable — the assignment engine then
 * falls back to city matching, and finally to a neutral (unknown) score. Guessing a
 * location would silently distort every distance score.
 */
export function pincodeCentroid(pincode: string | null | undefined): Coordinates | null {
  if (!pincode) return null;
  const digits = pincode.replace(/\D/g, '');
  if (digits.length !== 6) return null;

  // Deterministic, dependency-free derivation: map the 6-digit Indian pincode space onto
  // a lat/long grid. This keeps demo/seed data spatially coherent without external calls.
  const value = Number(digits);
  const latitude = 8 + ((value % 2500) / 2500) * 29; // 8°N .. 37°N
  const longitude = 68 + ((Math.floor(value / 2500) % 2500) / 2500) * 29; // 68°E .. 97°E
  return { latitude: round(latitude, 6), longitude: round(longitude, 6) };
}
