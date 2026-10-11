/**
 * Shared API types.
 *
 * These mirror the JSON contract returned by the Express backend (see
 * backend/src/utils/http.ts): single resources arrive as `{ data }`, collections as
 * `{ data, meta }` and failures as `{ error: { code, message, details } }`.
 */

export type Role = 'USER' | 'COLLECTION_AGENT' | 'CENTER_STAFF' | 'RECYCLER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type CenterStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export type PickupStatus =
  | 'REQUESTED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'COLLECTED'
  | 'RECEIVED_AT_CENTER'
  | 'FAILED'
  | 'CANCELLED';

export type ItemStatus =
  | 'SUBMITTED'
  | 'PICKUP_SCHEDULED'
  | 'COLLECTED'
  | 'RECEIVED_AT_CENTER'
  | 'INSPECTED'
  | 'IN_BATCH'
  | 'PROCESSING'
  | 'RECYCLED'
  | 'REJECTED'
  | 'CANCELLED';

export type BatchStatus = 'DRAFT' | 'READY' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED';
export type ItemCondition = 'WORKING' | 'REPAIRABLE' | 'FAULTY' | 'SEVERELY_DAMAGED';
export type QualityGrade = 'A' | 'B' | 'C' | 'D';
export type ProcessingPath = 'REFURBISHMENT' | 'COMPONENT_RECOVERY' | 'MATERIAL_RECOVERY' | 'DISPOSAL';
export type MaterialType =
  | 'COPPER'
  | 'ALUMINIUM'
  | 'STEEL'
  | 'GOLD'
  | 'SILVER'
  | 'PALLADIUM'
  | 'PLASTIC'
  | 'GLASS'
  | 'BATTERY_CHEMICALS'
  | 'RARE_EARTH'
  | 'OTHER';
export type AssignmentOutcome = 'ASSIGNED' | 'NO_ELIGIBLE_AGENT' | 'SKIPPED';
export type AssignmentMethod = 'AUTO' | 'MANUAL' | 'REASSIGNMENT';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  staffedCenterId: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  staffedCenter?: { id: number; name: string; code: string; city: string } | null;
  agentProfile?: AgentProfileSummary | null;
  recyclerProfile?: RecyclerProfileSummary | null;
}

export interface AgentProfileSummary {
  id: number;
  centerId: number | null;
  vehicleType: string | null;
  vehicleCapacityKg: number;
  isAvailable: boolean;
  isVerified: boolean;
  currentLoadCount: number;
  maxDailyPickups: number;
  ratingAvg: number;
}

export interface RecyclerProfileSummary {
  id: number;
  organizationName: string;
  licenseNumber: string;
  acceptedMaterials: MaterialType[];
  maxCapacityKg: number;
  isActive: boolean;
  contactPhone: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  hazardLevel: number;
  defaultPath: ProcessingPath;
  isActive: boolean;
  _count?: { items: number };
}

export interface CollectionCenter {
  id: number;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  capacityKg: number;
  status: CenterStatus;
  createdAt: string;
  _count?: { staff: number; agents: number; items: number; batches: number };
}

export interface Inspection {
  id: number;
  itemId: number;
  centerId: number | null;
  inspectedById: number | null;
  condition: ItemCondition;
  qualityScore: number;
  qualityGrade: QualityGrade;
  processingPath: ProcessingPath;
  actualWeightKg: number;
  isRepairable: boolean;
  hazardFlag: boolean;
  dataWipeRequired: boolean;
  dataWipeDone: boolean;
  remarks: string | null;
  inspectedAt: string;
  center?: { id: number; name: string; code: string; city?: string } | null;
  inspectedBy?: { id: number; fullName: string; role?: Role } | null;
  item?: EwasteItem;
}

export interface EwasteItem {
  id: number;
  itemCode: string;
  userId: number;
  pickupRequestId: number | null;
  categoryId: number;
  centerId: number | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  description: string | null;
  quantity: number;
  estimatedWeightKg: number | null;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  category?: { id: number; name: string; slug?: string; hazardLevel: number; defaultPath?: ProcessingPath };
  center?: { id: number; name: string; code: string; city?: string } | null;
  user?: { id: number; fullName: string; email: string; city?: string | null; phone?: string | null };
  pickupRequest?: {
    id: number;
    requestCode: string;
    status: PickupStatus;
    preferredDate: string;
    city?: string;
    agentId?: number | null;
    agent?: {
      id: number;
      vehicleType?: string | null;
      user: { id: number; fullName: string; phone: string | null };
    } | null;
  } | null;
  inspection?: Inspection | null;
  batchItem?: {
    id?: number;
    addedAt?: string;
    weightAtAdditionKg?: number | null;
    batch: { id: number; batchCode: string; name?: string; status: BatchStatus; processingPath?: ProcessingPath | null; recycler?: { id: number; fullName: string } | null };
  } | null;
}

export interface PickupRequest {
  id: number;
  requestCode: string;
  userId: number;
  agentId: number | null;
  centerId: number | null;
  categoryId: number | null;
  status: PickupStatus;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  preferredDate: string;
  timeSlot: string | null;
  notes: string | null;
  estimatedWeightKg: number | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  collectedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  failureReason: string | null;
  collectedWeightKg: number | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: number; fullName: string; email: string; phone: string | null; city?: string | null };
  agent?: {
    id: number;
    vehicleType: string | null;
    vehicleCapacityKg: number;
    isAvailable: boolean;
    ratingAvg: number;
    currentLoadCount: number;
    maxDailyPickups: number;
    user: { id: number; fullName: string; email: string; phone: string | null };
    center?: { id: number; name: string; code: string } | null;
  } | null;
  center?: { id: number; name: string; code: string; city?: string } | null;
  category?: { id: number; name: string } | null;
  items?: EwasteItem[];
  assignmentLogs?: AssignmentLog[];
  _count?: { items: number; assignmentLogs?: number };
}

export interface AssignmentLog {
  id: number;
  pickupRequestId: number;
  agentId: number | null;
  assignedById: number | null;
  method: AssignmentMethod;
  outcome: AssignmentOutcome;
  score: number | null;
  distanceKm: number | null;
  reason: string;
  candidates?: ScoredCandidate[] | null;
  createdAt: string;
  agent?: { id: number; user: { id: number; fullName: string } } | null;
  assignedBy?: { id: number; fullName: string; role: Role } | null;
  pickupRequest?: { id: number; requestCode: string; city: string };
}

export interface ScoredCandidate {
  agentProfileId: number;
  userId: number;
  fullName: string;
  eligible: boolean;
  exclusionReasons: string[];
  distanceKm: number | null;
  distanceSource: 'COORDINATES' | 'PINCODE_CENTROID' | 'CITY' | 'UNKNOWN';
  components: { distance: number; workload: number; reliability: number; capacity: number };
  totalScore: number;
  currentLoadCount: number;
  maxDailyPickups: number;
  utilizationPct: number;
  ratingAvg: number;
  vehicleCapacityKg: number;
}

export interface AssignmentPreview {
  pickupRequestId: number;
  currentStatus: PickupStatus;
  locationSource: string;
  config: { maxDistanceKm: number; weights: { distance: number; workload: number; availability: number; capacity: number } };
  recommended: ScoredCandidate | null;
  candidates: ScoredCandidate[];
  totalCandidates: number;
  eligibleCandidates: number;
}

export interface AssignmentResult {
  assigned: boolean;
  reason: string;
  pickupRequestId: number;
  agent?: { agentProfileId: number; userId: number; fullName: string; distanceKm: number | null };
  candidatesEvaluated: number;
  topCandidates: ScoredCandidate[];
}

export interface BatchItem {
  id: number;
  batchId: number;
  itemId: number;
  weightAtAdditionKg: number | null;
  addedAt: string;
  item: EwasteItem;
}

export interface ProcessingBatch {
  id: number;
  batchCode: string;
  centerId: number;
  recyclerId: number | null;
  createdById: number | null;
  name: string;
  status: BatchStatus;
  processingPath: ProcessingPath | null;
  targetWeightKg: number | null;
  actualWeightKg: number | null;
  releasedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  center?: { id: number; name: string; code: string; city?: string };
  recycler?: {
    id: number;
    fullName: string;
    email: string;
    phone: string | null;
    recyclerProfile?: { id: number; organizationName: string; licenseNumber: string } | null;
  } | null;
  createdBy?: { id: number; fullName: string; role: Role } | null;
  batchItems?: BatchItem[];
  recoveredMaterials?: RecoveredMaterial[];
  itemCount?: number;
  itemWeightKg?: number;
  recoveredWeightKg?: number;
  recoveredValue?: number;
  recoveryRatePct?: number | null;
  _count?: { batchItems: number; recoveredMaterials: number };
}

export interface RecoveredMaterial {
  id: number;
  batchId: number;
  itemId: number | null;
  recordedById: number | null;
  materialType: MaterialType;
  quantityKg: number;
  unit: string;
  purityPct: number | null;
  marketValuePerKg: number | null;
  notes: string | null;
  recordedAt: string;
  batch?: { id: number; batchCode: string; name: string; status: BatchStatus; centerId?: number; recyclerId?: number | null; center?: { id: number; name: string; code: string } };
  recordedBy?: { id: number; fullName: string; role: Role } | null;
  item?: { id: number; itemCode: string; name: string } | null;
}

export interface TimelineEvent {
  id: number;
  entityType: 'PICKUP_REQUEST' | 'EWASTE_ITEM' | 'PROCESSING_BATCH';
  status: string;
  note: string | null;
  createdAt: string;
  actor: { id: number; fullName: string; role: Role } | null;
  metadata: Record<string, unknown> | null;
  subject: 'ITEM' | 'PICKUP_REQUEST' | 'BATCH';
  subjectRef: string | null;
}

export interface CenterStats {
  center: { id: number; name: string; code: string; capacityKg: number; status: CenterStatus };
  totalItems: number;
  itemsAtCenter: number;
  itemsByStatus: { status: ItemStatus; count: number }[];
  inspectionsCompleted: number;
  openBatches: number;
  completedBatches: number;
  incomingPickups: number;
  totalWeightKg: number;
  recoveredWeightKg: number;
  capacityUtilizationPct: number;
}

export interface InspectionSummary {
  inspectionsCompleted: number;
  totalWeightKg: number;
  averageQualityScore: number | null;
  hazardFlagged: number;
  byProcessingPath: { path: ProcessingPath; count: number }[];
  byCondition: { condition: ItemCondition; count: number }[];
  byGrade: { grade: QualityGrade; count: number }[];
}

export interface ListAgentsRow {
  agentProfileId: number;
  userId: number;
  fullName: string;
  email: string;
  phone: string | null;
  userStatus: UserStatus;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  center: { id: number; name: string; code: string; city: string; latitude: number | null; longitude: number | null } | null;
  vehicleType: string | null;
  vehicleCapacityKg: number;
  isAvailable: boolean;
  isVerified: boolean;
  ratingAvg: number;
  currentLoadCount: number;
  maxDailyPickups: number;
  utilizationPct: number;
}

export interface ListRecyclersRow {
  id: number;
  userId: number;
  organizationName: string;
  licenseNumber: string;
  acceptedMaterials: MaterialType[];
  maxCapacityKg: number;
  isActive: boolean;
  contactPhone: string | null;
  contactName: string;
  email: string;
  userStatus: UserStatus;
  city: string | null;
  openBatches: number;
}

export interface AnalyticsSummary {
  items: { total: number; estimatedWeightKg: number; byStatus: { status: ItemStatus; count: number }[] };
  pickups: { total: number; byStatus: { status: PickupStatus; count: number }[] };
  inspections: { completed: number; measuredWeightKg: number; averageQualityScore: number | null };
  batches: { total: number; byStatus: { status: BatchStatus; count: number }[] };
  recovery: { records: number; quantityKg: number; yieldPct: number | null };
  users: { role: Role; count: number }[];
  collectionCenters: number | null;
}

export interface MonthlyPoint {
  month: string;
  submissions: number;
  collected: number;
  recovered: number;
  recoveredQuantityKg: number;
}

export interface MaterialRecoveryRow {
  materialType: MaterialType;
  quantityKg: number;
  records: number;
  averagePurityPct: number | null;
}

export interface CategoryMixRow {
  categoryId: number;
  name: string;
  hazardLevel: number;
  defaultPath: ProcessingPath | null;
  count: number;
  estimatedWeightKg: number;
}

export interface AnalyticsOverview {
  role: Role;
  generatedAt: string;
  summary: AnalyticsSummary;
  monthly: MonthlyPoint[];
  materialRecovery: MaterialRecoveryRow[];
  categoryMix: CategoryMixRow[];
}

export interface CenterPerformanceRow {
  id: number;
  name: string;
  code: string;
  city: string;
  status: CenterStatus;
  capacityKg: number;
  itemsReceived: number;
  inspections: number;
  inspectedWeightKg: number;
  batches: number;
  completedBatches: number;
  recoveredWeightKg: number;
  recoveryRatePct: number | null;
  staffCount: number;
  agentCount: number;
}

export interface AgentPerformanceRow {
  agentProfileId: number;
  userId: number;
  fullName: string;
  city: string | null;
  isAvailable: boolean;
  isVerified: boolean;
  currentLoadCount: number;
  maxDailyPickups: number;
  utilizationPct: number;
  ratingAvg: number;
  vehicleCapacityKg: number;
  openPickups: number;
  completedPickups: number;
  failedPickups: number;
  collectedWeightKg: number;
  averageAssignmentDistanceKm: number | null;
  completionRatePct: number | null;
}

export interface RecyclerPerformanceRow {
  recyclerProfileId: number;
  userId: number;
  fullName: string;
  organizationName: string;
  licenseNumber: string;
  isActive: boolean;
  acceptedMaterials: MaterialType[];
  maxCapacityKg: number;
  totalBatches: number;
  openBatches: number;
  completedBatches: number;
  itemsProcessed: number;
  recoveredKg: number;
  recoveredValue: number;
  averagePurityPct: number | null;
}

export interface AssignmentStats {
  totalAttempts: number;
  byOutcome: { outcome: AssignmentOutcome; count: number }[];
  byMethod: { method: AssignmentMethod; count: number }[];
  successRatePct: number | null;
  averageScore: number | null;
  averageDistanceKm: number | null;
  recentFailures: {
    id: number;
    reason: string;
    outcome: AssignmentOutcome;
    createdAt: string;
    pickupRequest: { id: number; requestCode: string; city: string };
  }[];
}

export interface CycleTimeRow {
  stage: string;
  sampleSize: number;
  averageHours: number | null;
}

export interface DashboardPayload {
  role: Role;
  // Shape varies by role; pages narrow it as needed.
  [key: string]: unknown;
}

export interface UserRow {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  city: string | null;
  state: string | null;
  staffedCenterId: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  staffedCenter?: { id: number; name: string; code: string } | null;
  agentProfile?: {
    id: number;
    centerId: number | null;
    isAvailable: boolean;
    isVerified: boolean;
    currentLoadCount: number;
    maxDailyPickups: number;
    ratingAvg: number;
    vehicleCapacityKg: number;
    center?: { id: number; name: string; code: string } | null;
  } | null;
  recyclerProfile?: {
    id: number;
    organizationName: string;
    licenseNumber: string;
    acceptedMaterials: MaterialType[];
    maxCapacityKg: number;
    isActive: boolean;
  } | null;
  _count?: { submittedItems: number; submittedRequests: number; recoveryRecords: number };
}
