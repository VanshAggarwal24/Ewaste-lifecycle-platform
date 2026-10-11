import { apiDelete, apiGet, apiGetList, apiPatch, apiPost, apiPostMessage } from './client';
import type {
  AgentPerformanceRow,
  AgentProfileSummary,
  AnalyticsOverview,
  AnalyticsSummary,
  AssignmentLog,
  AssignmentPreview,
  AssignmentResult,
  AssignmentStats,
  AuthUser,
  BatchItem,
  Category,
  CenterPerformanceRow,
  CenterStats,
  CollectionCenter,
  CycleTimeRow,
  EwasteItem,
  Inspection,
  InspectionSummary,
  ListAgentsRow,
  ListRecyclersRow,
  MaterialRecoveryRow,
  MaterialType,
  MonthlyPoint,
  Paginated,
  PickupRequest,
  ProcessingBatch,
  RecoveredMaterial,
  RecyclerPerformanceRow,
  Role,
  TimelineEvent,
  UserRow,
  UserStatus,
} from './types';

/**
 * One function per backend endpoint.
 *
 * Grouping the API surface here keeps pages free of string-built URLs and makes the
 * client/server contract reviewable in a single file. Query parameters that are `undefined`
 * are dropped by the client, so optional filters can be passed directly.
 */

type Query = Record<string, string | number | boolean | undefined | null>;

const list = <T,>(path: string, query?: Query, signal?: AbortSignal): Promise<Paginated<T>> =>
  apiGetList<T>(path, query, signal);

// ---------------------------------------------------------------------------------------
// Authentication & profile
// ---------------------------------------------------------------------------------------

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  register: (payload: Record<string, unknown>) => apiPost<AuthResponse>('/api/auth/register', payload),
  login: (email: string, password: string) => apiPost<AuthResponse>('/api/auth/login', { email, password }),
  me: () => apiGet<{ user: AuthUser }>('/api/auth/me'),
  updateProfile: (payload: Record<string, unknown>) => apiPatch<{ user: AuthUser }>('/api/auth/me', payload),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiPostMessage('/api/auth/change-password', { currentPassword, newPassword }),
};

// ---------------------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------------------

export const categoryApi = {
  list: (query?: Query, signal?: AbortSignal) => list<Category>('/api/categories', { limit: 100, ...query }, signal),
  create: (payload: Record<string, unknown>) => apiPost<{ category: Category }>('/api/categories', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ category: Category }>(`/api/categories/${id}`, payload),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/categories/${id}`),
};

export const centerApi = {
  list: (query?: Query, signal?: AbortSignal) =>
    list<CollectionCenter>('/api/centers', { limit: 100, ...query }, signal),
  create: (payload: Record<string, unknown>) => apiPost<{ center: CollectionCenter }>('/api/centers', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ center: CollectionCenter }>(`/api/centers/${id}`, payload),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/centers/${id}`),
  stats: (id: number, signal?: AbortSignal) => apiGet<CenterStats>(`/api/centers/${id}/stats`, undefined, signal),
};

// ---------------------------------------------------------------------------------------
// E-waste items
// ---------------------------------------------------------------------------------------

export interface ItemSummaryPayload {
  totalItems: number;
  byStatus: { status: string; count: number }[];
  totalInspectedWeightKg: number;
  averageQualityScore: number | null;
  topCategories: { categoryId: number; name: string; hazardLevel: number; count: number }[];
}

export const itemApi = {
  list: (query?: Query, signal?: AbortSignal) => list<EwasteItem>('/api/items', query, signal),
  summary: (signal?: AbortSignal) => apiGet<ItemSummaryPayload>('/api/items/summary', undefined, signal),
  pendingInspection: (query?: Query, signal?: AbortSignal) =>
    list<EwasteItem>('/api/items/pending-inspection', query, signal),
  create: (payload: Record<string, unknown>) =>
    apiPost<{ items: EwasteItem[]; pickupRequest: PickupRequest | null }>('/api/items', payload),
  get: (id: number, signal?: AbortSignal) => apiGet<{ item: EwasteItem }>(`/api/items/${id}`, undefined, signal),
  timeline: (id: number, signal?: AbortSignal) => list<TimelineEvent>(`/api/items/${id}/timeline`, undefined, signal),
  update: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ item: EwasteItem }>(`/api/items/${id}`, payload),
  cancel: (id: number, reason?: string) => apiPost<{ item: EwasteItem }>(`/api/items/${id}/cancel`, { reason }),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/items/${id}`),
  inspect: (id: number, payload: Record<string, unknown>) =>
    apiPost<{ inspection: Inspection }>(`/api/items/${id}/inspect`, payload),
};

// ---------------------------------------------------------------------------------------
// Pickup requests
// ---------------------------------------------------------------------------------------

export interface PickupDetail {
  pickupRequest: PickupRequest;
  actions: {
    transitions: string[];
    actions: string[];
    isOwner: boolean;
    isAssignedAgent: boolean;
    canAssign: boolean;
  };
}

export const pickupApi = {
  list: (query?: Query, signal?: AbortSignal) => list<PickupRequest>('/api/pickups', query, signal),
  create: (payload: Record<string, unknown>) =>
    apiPost<{ pickupRequest: PickupRequest }>('/api/pickups', payload),
  get: (id: number, signal?: AbortSignal) => apiGet<PickupDetail>(`/api/pickups/${id}`, undefined, signal),
  timeline: (id: number, signal?: AbortSignal) =>
    list<TimelineEvent>(`/api/pickups/${id}/timeline`, undefined, signal),
  assignmentLogs: (id: number, signal?: AbortSignal) =>
    list<AssignmentLog>(`/api/pickups/${id}/assignment-logs`, undefined, signal),
  assignmentPreview: (id: number, signal?: AbortSignal) =>
    apiGet<AssignmentPreview>(`/api/pickups/${id}/assignment-preview`, undefined, signal),
  assign: (id: number, payload: { method: 'AUTO' | 'MANUAL' | 'REASSIGNMENT'; agentId?: number; force?: boolean }) =>
    apiPost<AssignmentResult>(`/api/pickups/${id}/assign`, payload),
  accept: (id: number) => apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/accept`),
  decline: (id: number, reason: string) => apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/decline`, { reason }),
  collect: (id: number, payload: { collectedWeightKg?: number; notes?: string }) =>
    apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/collect`, payload),
  fail: (id: number, reason: string) => apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/fail`, { reason }),
  receive: (id: number, payload: { centerId?: number; notes?: string }) =>
    apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/receive`, payload),
  cancel: (id: number, reason?: string) => apiPost<{ pickupRequest: PickupRequest }>(`/api/pickups/${id}/cancel`, { reason }),
};

// ---------------------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------------------

export const inspectionApi = {
  list: (query?: Query, signal?: AbortSignal) => list<Inspection>('/api/inspections', query, signal),
  summary: (query?: Query, signal?: AbortSignal) => apiGet<InspectionSummary>('/api/inspections/summary', query, signal),
  bulk: (inspections: Record<string, unknown>[]) =>
    apiPost<{ inspections: Inspection[] }>('/api/inspections/bulk', { inspections }),
  get: (id: number, signal?: AbortSignal) => apiGet<{ inspection: Inspection }>(`/api/inspections/${id}`, undefined, signal),
  update: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ inspection: Inspection }>(`/api/inspections/${id}`, payload),
};

// ---------------------------------------------------------------------------------------
// Processing batches & material recovery
// ---------------------------------------------------------------------------------------

export interface BatchDetail {
  batch: ProcessingBatch;
  actions: { transitions: string[]; actions: string[]; isStaff: boolean; isAssignedRecycler: boolean };
}

export const batchApi = {
  list: (query?: Query, signal?: AbortSignal) => list<ProcessingBatch>('/api/batches', query, signal),
  batchableItems: (query?: Query, signal?: AbortSignal) => list<EwasteItem>('/api/batches/batchable-items', query, signal),
  create: (payload: Record<string, unknown>) => apiPost<{ batch: ProcessingBatch }>('/api/batches', payload),
  get: (id: number, signal?: AbortSignal) => apiGet<BatchDetail>(`/api/batches/${id}`, undefined, signal),
  timeline: (id: number, signal?: AbortSignal) => list<TimelineEvent>(`/api/batches/${id}/timeline`, undefined, signal),
  update: (id: number, payload: Record<string, unknown>) => apiPatch<{ batch: ProcessingBatch }>(`/api/batches/${id}`, payload),
  addItems: (id: number, itemIds: number[]) => apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/items`, { itemIds }),
  removeItem: (id: number, itemId: number) =>
    apiDelete<{ message: string }>(`/api/batches/${id}/items/${itemId}`),
  markReady: (id: number) => apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/ready`),
  assignRecycler: (id: number, recyclerId: number, notes?: string) =>
    apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/recycler`, { recyclerId, notes }),
  release: (id: number, notes?: string) => apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/release`, { notes }),
  start: (id: number, notes?: string) => apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/start`, { notes }),
  complete: (id: number, payload: { actualWeightKg?: number; notes?: string }) =>
    apiPost<{ batch: ProcessingBatch }>(`/api/batches/${id}/complete`, payload),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/batches/${id}`),
  recoveries: (id: number, query?: Query, signal?: AbortSignal) =>
    list<RecoveredMaterial>(`/api/batches/${id}/recoveries`, query, signal),
  addRecovery: (id: number, payload: Record<string, unknown>) =>
    apiPost<{ recovery: RecoveredMaterial }>(`/api/batches/${id}/recoveries`, payload),
};

export const recoveryApi = {
  list: (query?: Query, signal?: AbortSignal) => list<RecoveredMaterial>('/api/recoveries', query, signal),
  byMaterial: (query?: Query, signal?: AbortSignal) =>
    apiGet<MaterialRecoveryRow[]>('/api/recoveries/by-material', query, signal),
  update: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ recovery: RecoveredMaterial }>(`/api/recoveries/${id}`, payload),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/recoveries/${id}`),
};

/** Items ready to be batched, plus their batch membership. */
export type BatchableItems = { data: EwasteItem[]; meta: { total: number } };
export type BatchItemsPayload = { batchItems: BatchItem[] };

// ---------------------------------------------------------------------------------------
// Dashboards, activity & analytics
// ---------------------------------------------------------------------------------------

/** The dashboard payload is role-shaped; callers name the shape they expect. */
export const dashboardApi = {
  get: <T = Record<string, unknown>>(signal?: AbortSignal) => apiGet<T>('/api/dashboard', undefined, signal),
};

export const activityApi = {
  list: (query?: Query, signal?: AbortSignal) => list<TimelineEvent>('/api/activity', query, signal),
};

export const analyticsApi = {
  overview: (months = 6, signal?: AbortSignal) =>
    apiGet<AnalyticsOverview>('/api/analytics/overview', { months }, signal),
  summary: (signal?: AbortSignal) => apiGet<AnalyticsSummary>('/api/analytics/summary', undefined, signal),
  monthly: (months = 6, signal?: AbortSignal) => apiGet<MonthlyPoint[]>('/api/analytics/monthly', { months }, signal),
  materials: (signal?: AbortSignal) => apiGet<MaterialRecoveryRow[]>('/api/analytics/materials', undefined, signal),
  centers: (signal?: AbortSignal) => apiGet<CenterPerformanceRow[]>('/api/analytics/centers', undefined, signal),
  agents: (signal?: AbortSignal) => apiGet<AgentPerformanceRow[]>('/api/analytics/agents', undefined, signal),
  recyclers: (signal?: AbortSignal) => apiGet<RecyclerPerformanceRow[]>('/api/analytics/recyclers', undefined, signal),
  assignments: (signal?: AbortSignal) => apiGet<AssignmentStats>('/api/analytics/assignments', undefined, signal),
  cycleTimes: (signal?: AbortSignal) => apiGet<CycleTimeRow[]>('/api/analytics/cycle-times', undefined, signal),
  recentActivity: (signal?: AbortSignal) =>
    list<TimelineEvent>('/api/analytics/recent-activity', undefined, signal),
};

// ---------------------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------------------

export const userApi = {
  list: (query?: Query, signal?: AbortSignal) => list<UserRow>('/api/users', query, signal),
  agents: (query?: Query, signal?: AbortSignal) => list<ListAgentsRow>('/api/users/agents', query, signal),
  recyclers: (query?: Query, signal?: AbortSignal) => list<ListRecyclersRow>('/api/users/recyclers', query, signal),
  get: (id: number, signal?: AbortSignal) => apiGet<{ user: UserRow }>(`/api/users/${id}`, undefined, signal),
  create: (payload: Record<string, unknown>) => apiPost<{ user: UserRow }>('/api/users', payload),
  update: (id: number, payload: Record<string, unknown>) => apiPatch<{ user: UserRow }>(`/api/users/${id}`, payload),
  updateAgentProfile: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ user: UserRow; agentProfile: AgentProfileSummary }>(`/api/users/agents/${id}`, payload),
  updateRecyclerProfile: (id: number, payload: Record<string, unknown>) =>
    apiPatch<{ user: UserRow }>(`/api/users/recyclers/${id}`, payload),
  suspend: (id: number) => apiPost<{ user: UserRow }>(`/api/users/${id}/suspend`),
  activate: (id: number) => apiPost<{ user: UserRow }>(`/api/users/${id}/activate`),
  resetPassword: (id: number, newPassword: string) =>
    apiPostMessage(`/api/users/${id}/reset-password`, { newPassword }),
  remove: (id: number) => apiDelete<{ message: string }>(`/api/users/${id}`),
};

export type { UserStatus, Role, MaterialType };
