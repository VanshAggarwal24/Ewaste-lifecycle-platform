import type { Role } from '@/api/types';

/**
 * Vocabulary shared across the UI: role metadata, status colours and lifecycle labels.
 * Keeping it in one module means a status can never be described two different ways.
 */

export const ROLES: Role[] = ['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN'];

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Citizen',
  COLLECTION_AGENT: 'Collection Agent',
  CENTER_STAFF: 'Centre Staff',
  RECYCLER: 'Recycler',
  ADMIN: 'Administrator',
};

export const ROLE_HOME: Record<Role, string> = {
  USER: '/dashboard',
  COLLECTION_AGENT: '/agent',
  CENTER_STAFF: '/center',
  RECYCLER: '/recycler',
  ADMIN: '/admin',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  USER: 'Submit e-waste, schedule pickups and follow every step of the journey.',
  COLLECTION_AGENT: 'Accept assigned pickups, record what you collected and hand it over at the centre.',
  CENTER_STAFF: 'Receive, inspect and classify incoming items, then build processing batches.',
  RECYCLER: 'Process released batches and record recovered materials with purity and value.',
  ADMIN: 'Manage people, centres and catalogue data; monitor the whole operation.',
};

export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';

/** Status → tone, used by <StatusBadge>. Every status in the domain appears here. */
export const STATUS_TONES: Record<string, Tone> = {
  // Item
  SUBMITTED: 'neutral',
  PICKUP_SCHEDULED: 'info',
  COLLECTED: 'info',
  RECEIVED_AT_CENTER: 'progress',
  INSPECTED: 'progress',
  IN_BATCH: 'progress',
  PROCESSING: 'progress',
  RECYCLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  // Pickup
  REQUESTED: 'warning',
  ASSIGNED: 'info',
  ACCEPTED: 'progress',
  FAILED: 'danger',
  // Batch
  DRAFT: 'neutral',
  READY: 'info',
  RELEASED: 'progress',
  IN_PROGRESS: 'progress',
  COMPLETED: 'success',
  // Users / centres
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  INACTIVE: 'neutral',
  MAINTENANCE: 'warning',
  // Assignment audit
  NO_ELIGIBLE_AGENT: 'danger',
  SKIPPED: 'neutral',
};

export const CONDITION_LABELS: Record<string, string> = {
  WORKING: 'Working',
  REPAIRABLE: 'Repairable',
  FAULTY: 'Faulty',
  SEVERELY_DAMAGED: 'Severely damaged',
};

export const PATH_LABELS: Record<string, string> = {
  REFURBISHMENT: 'Refurbishment',
  COMPONENT_RECOVERY: 'Component recovery',
  MATERIAL_RECOVERY: 'Material recovery',
  DISPOSAL: 'Disposal',
};

export const PATH_DESCRIPTIONS: Record<string, string> = {
  REFURBISHMENT: 'Tested and repaired so the device can be reused as a whole unit.',
  COMPONENT_RECOVERY: 'Useful parts and components are harvested from the device.',
  MATERIAL_RECOVERY: 'Shredded and separated into recoverable raw materials.',
  DISPOSAL: 'No recoverable value — routed to safe, compliant disposal.',
};

export const MATERIAL_LABELS: Record<string, string> = {
  COPPER: 'Copper',
  ALUMINIUM: 'Aluminium',
  STEEL: 'Steel',
  GOLD: 'Gold',
  SILVER: 'Silver',
  PALLADIUM: 'Palladium',
  PLASTIC: 'Plastic',
  RARE_EARTH: 'Rare earth elements',
  GLASS: 'Glass',
  BATTERY_CHEMICALS: 'Battery chemicals',
  OTHER: 'Other',
};

export const MATERIAL_OPTIONS = Object.keys(MATERIAL_LABELS);

export const CONDITION_OPTIONS = Object.keys(CONDITION_LABELS);
export const PATH_OPTIONS = Object.keys(PATH_LABELS);

/** Grade thresholds. Must agree with the database CHECK constraint and the API rules. */
export const GRADE_BANDS: { grade: 'A' | 'B' | 'C' | 'D'; min: number; max: number; tone: Tone }[] = [
  { grade: 'A', min: 85, max: 100, tone: 'success' },
  { grade: 'B', min: 70, max: 84, tone: 'info' },
  { grade: 'C', min: 50, max: 69, tone: 'warning' },
  { grade: 'D', min: 0, max: 49, tone: 'danger' },
];

export function gradeForScore(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export const ACTIVE_PICKUP_STATUSES = ['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'COLLECTED'] as const;

export const ITEM_STATUS_OPTIONS = [
  'SUBMITTED',
  'PICKUP_SCHEDULED',
  'COLLECTED',
  'RECEIVED_AT_CENTER',
  'INSPECTED',
  'IN_BATCH',
  'PROCESSING',
  'RECYCLED',
  'REJECTED',
  'CANCELLED',
];

export const PICKUP_STATUS_OPTIONS = [
  'REQUESTED',
  'ASSIGNED',
  'ACCEPTED',
  'COLLECTED',
  'RECEIVED_AT_CENTER',
  'FAILED',
  'CANCELLED',
];

export const BATCH_STATUS_OPTIONS = ['DRAFT', 'READY', 'RELEASED', 'IN_PROGRESS', 'COMPLETED'];
