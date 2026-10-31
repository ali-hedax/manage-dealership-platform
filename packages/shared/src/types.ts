import type {
  BlockerReason,
  CaseStage,
  CaseStatus,
  CoverageType,
  ModuleKey,
  Role,
  TaskStatus,
} from './enums';
import type { Permission } from './permissions';

// Response contracts returned by the API.

export interface Me {
  id: string;
  username: string;
  displayName: string;
  roles: Role[];
  permissions: Permission[];
  tenant: { id: string; code: string; name: string };
  environment: string;
  modules: { key: ModuleKey; status: 'active' | 'planned' }[];
}

export interface UserRef {
  id: string;
  displayName: string;
}

export interface CaseListItem {
  id: string;
  caseNumber: string;
  stage: CaseStage;
  status: CaseStatus;
  coverageType: CoverageType;
  admittedAt: string;
  officialDeadlineAt: string | null;
  forecastDeliveryAt: string | null;
  customerName: string | null;
  vehicleLabel: string;
  plate: string | null;
  vin: string | null;
  responsible: UserRef | null;
  openBlockers: number;
  progressPercent: number;
  missingFields: string[];
  isLegacyEntry: boolean;
  isTest: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Task {
  id: string;
  caseId: string;
  department: { id: string; code: string; name: string };
  title: string | null;
  technicianName: string | null;
  technicianCode: string | null;
  status: TaskStatus;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  approvedAt: string | null;
  approvedBy: UserRef | null;
  dependsOn: string[];
  weight: number;
  notes: string | null;
  version: number;
}

export interface Blocker {
  id: string;
  caseId: string;
  taskId: string | null;
  reason: BlockerReason;
  description: string | null;
  occurredAt: string;
  recordedAt: string;
  recordedBy: UserRef;
  lastFollowUpAt: string | null;
  followUpCount: number;
  resolvedAt: string | null;
  resolvedBy: UserRef | null;
  resolutionNote: string | null;
}

export interface TimelineEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  actor: UserRef | null;
  reason: string | null;
  summary: Record<string, unknown> | null;
}

export interface CaseDetail extends Omit<CaseListItem, 'customerName'> {
  version: number;
  customer: { id: string; fullName: string | null; phone: string | null; phoneMasked: boolean } | null;
  vehicle: {
    id: string;
    brand: string | null;
    model: string | null;
    trim: string | null;
    modelYear: number | null;
    plate: string | null;
    vin: string | null;
    color: string | null;
  };
  odometerKm: number | null;
  damageDescription: string | null;
  vehicleLocation: string | null;
  goldenCardFileNo: string | null;
  insurerName: string | null;
  insuranceClaimNo: string | null;
  coverageNotes: string | null;
  actualDeliveryAt: string | null;
  createdAt: string;
  createdBy: UserRef;
  updatedAt: string;
  tasks: Task[];
  blockers: Blocker[];
}

export interface DashboardSummary {
  generatedAt: string;
  activeCases: number;
  overdue: number;
  dueSoon: number;
  blockedCases: number;
  needsCompletion: number;
  unassigned: number;
  readyForDelivery: number;
  legacyEntries: number;
  byStage: { stage: CaseStage; count: number }[];
  byCoverage: { coverage: CoverageType; count: number }[];
  openBlockersByReason: { reason: BlockerReason; count: number }[];
  staleBlockers: number;
  departments: { id: string; name: string; inProgress: number; blocked: number; pending: number }[];
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
