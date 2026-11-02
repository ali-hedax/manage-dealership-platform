import type {
  AssessmentItemAction,
  AssessmentKind,
  AssessmentStatus,
  AuthorizationMethod,
  AuthorizationSource,
  AuthorizationStatus,
  BlockerReason,
  CompletionIssueCode,
  ImportDeadlineTarget,
  VehicleImportOutcome,
  FinanceApprovalKind,
  FinanceApprovalStatus,
  FinanceGateReason,
  ItemApprovalStatus,
  PartInspection,
  PartSource,
  PartStatus,
  QcCheckItem,
  QcOutcome,
  QcResult,
  RecipientRelation,
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
  authentication?: 'password' | 'totp';
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
  /** QC round whose failed item opened this corrective activity. */
  qcInspectionId: string | null;
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
  partRequestId: string | null;
}

export interface AssessmentItem {
  id: string;
  lineNo: number;
  action: AssessmentItemAction;
  description: string;
  partNumber: string | null;
  quantity: number;
  unitPriceRial: number;
  labourDepartment: { id: string; name: string } | null;
  labourRial: number;
  evidence: string | null;
  approvalStatus: ItemApprovalStatus;
  /** Item of the previous version this line was copied from; null = new in this version. */
  originItemId: string | null;
  /** True when the line is new or changed compared with the previous version. */
  changed: boolean;
}

export interface AssessmentTotals {
  partsRial: number;
  labourRial: number;
  totalRial: number;
  /** Total minus rejected items; equals totalRial until a decision is recorded. */
  approvedRial: number;
}

export interface Assessment {
  id: string;
  caseId: string;
  versionNo: number;
  kind: AssessmentKind;
  status: AssessmentStatus;
  assessorName: string;
  assessorOrg: string | null;
  assessedAt: string;
  reason: string | null;
  discoveredAt: string | null;
  notes: string | null;
  finalizedAt: string | null;
  finalizedBy: UserRef | null;
  authorizationStatus: AuthorizationStatus;
  authorization: {
    source: AuthorizationSource;
    method: AuthorizationMethod;
    reference: string | null;
    at: string;
    note: string | null;
    recordedBy: UserRef;
  } | null;
  /** Blocker that keeps the case waiting until the authorization is recorded. */
  blockerId: string | null;
  items: AssessmentItem[];
  totals: AssessmentTotals;
  /** Difference with the previous final version (supplements only). */
  deltaRial: number | null;
  /** Final supplement that raises the cost: the financial gate (issue #10) must re-approve. */
  requiresFinancialReview: boolean;
  createdAt: string;
  createdBy: UserRef;
  version: number;
}

export interface Part {
  id: string;
  caseId: string;
  assessmentItemId: string | null;
  description: string;
  partNumber: string | null;
  quantity: number;
  source: PartSource;
  status: PartStatus;
  inStock: boolean | null;
  stockCheckedAt: string | null;
  reservedAt: string | null;
  approvedUnitPriceRial: number | null;
  unitPriceRial: number | null;
  priceApprovalRef: string | null;
  priceApprovedBy: string | null;
  supplier: string | null;
  orderRef: string | null;
  orderedAt: string | null;
  etaAt: string | null;
  firstEtaAt: string | null;
  receivedAt: string | null;
  receiptDocNo: string | null;
  inspection: PartInspection | null;
  inspectionNote: string | null;
  handedOverAt: string | null;
  handedOverDepartment: { id: string; name: string } | null;
  recipientName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Why the purchase was allowed when it was ordered. */
  financeBasis: FinanceGateReason | 'not_purchase' | null;
  notes: string | null;
  createdAt: string;
  createdBy: UserRef;
  /** Ordered and past its expected arrival. */
  overdue: boolean;
  version: number;
}

export interface PartImportRow {
  row: number;
  description: string;
  partNumber: string | null;
  quantity: number;
  source: PartSource;
  approvedUnitPriceRial: number | null;
  notes: string | null;
}

export interface PartImportResult {
  dryRun: boolean;
  rows: PartImportRow[];
  errors: { row: number; message: string }[];
  created: number;
}

export interface FinanceApproval {
  id: string;
  kind: FinanceApprovalKind;
  status: FinanceApprovalStatus;
  amountRial: number;
  /** Estimate the approval was given for; a larger estimate needs a new approval. */
  coversEstimateRial: number;
  /** Exceptions: amount already spent on purchases under this exception. */
  spentRial: number;
  reason: string;
  proposedAt: string;
  proposedBy: UserRef;
  decidedAt: string | null;
  decidedBy: UserRef | null;
  decisionNote: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  paymentConfirmedBy: UserRef | null;
  version: number;
}

export interface FinanceGate {
  open: boolean;
  reason: FinanceGateReason;
  message: string;
}

export interface CaseFinance {
  caseId: string;
  /** Approved amount of the current assessment version (0 without one). */
  estimateRial: number;
  shares: {
    customerShareRial: number | null;
    insurerShareRial: number | null;
    companyShareRial: number | null;
    note: string | null;
    version: number | null;
  };
  /** Customer share used by the gate: recorded, or derived from the coverage type. */
  customerShareRial: number | null;
  customerShareDerived: boolean;
  paidRial: number;
  /** Customer share still to collect. */
  balanceRial: number | null;
  /** Committed purchases (ordered parts). */
  purchasesRial: number;
  gate: FinanceGate;
  approvals: FinanceApproval[];
  /** Settlement payments recorded by the cashier (advances are in approvals). */
  payments: SettlementPayment[];
}

export interface SettlementPayment {
  id: string;
  amountRial: number;
  paymentRef: string;
  paidAt: string;
  note: string | null;
  recordedBy: UserRef;
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
    /** Chassis number as recorded on the admission sheet (may be short; not a VIN). */
    chassisRef: string | null;
  };
  /** Workshop admission card number (not the Manage case number). */
  admissionNo: string | null;
  /** 'date' when only the admission day is known (imported record). */
  admittedAtPrecision: 'minute' | 'date';
  origin: 'manual' | 'excel_import';
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
  awaitingAuthorization: number;
  partsOverdue: number;
  partsToOrder: number;
  financePending: number;
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

export interface QcCheck {
  item: QcCheckItem;
  result: QcResult;
  note: string | null;
  departmentId: string | null;
  /** Corrective activity opened for a failed item. */
  correctiveTaskId: string | null;
}

export interface QcInspection {
  id: string;
  round: number;
  outcome: QcOutcome;
  checks: QcCheck[];
  note: string | null;
  inspectedAt: string;
  inspectedBy: UserRef;
}

export interface CompletionIssue {
  code: CompletionIssueCode;
  message: string;
  /** Number of activities, blockers, parts or lines concerned. */
  count?: number;
  amountRial?: number;
  /** Shown but does not block the close. */
  warning?: boolean;
}

export interface CloseState {
  closedAt: string | null;
  closedBy: UserRef | null;
  note: string | null;
  /** Closed and still consistent with the case (nothing changed since). */
  valid: boolean;
  /** Blocking issues and warnings evaluated now. */
  issues: CompletionIssue[];
}

export interface CaseCompletion {
  caseId: string;
  qc: QcInspection[];
  technical: CloseState;
  financial: CloseState & {
    /** Customer balance accepted as unpaid at the close (manager waiver). */
    waivedRial: number | null;
  };
  delivery: {
    deliveredAt: string;
    recipientName: string;
    recipientRelation: RecipientRelation;
    note: string | null;
    deliveredBy: UserRef;
  } | null;
  /** Issues that still prevent the handover. */
  deliveryIssues: CompletionIssue[];
}

export interface VehicleImportMessage {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface VehicleImportChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface VehicleImportRow {
  /** Row number in the sheet (as Excel shows it). */
  rowNo: number;
  outcome: VehicleImportOutcome;
  /** Values as they appear in the file, by column header. */
  source: Record<string, string>;
  identity: string | null;
  caseId: string | null;
  caseNumber: string | null;
  changes: VehicleImportChange[];
  messages: VehicleImportMessage[];
}

export interface VehicleImport {
  id: string;
  status: 'preview' | 'applied' | 'partial';
  fileName: string;
  sheetName: string;
  headerRow: number;
  decisions: { dateWithoutTime: boolean; deadlineAs: ImportDeadlineTarget };
  counts: Record<VehicleImportOutcome, number>;
  /** Empty template rows that were skipped, by row number. */
  blankRows: number[];
  /** Columns of the file that have no destination in Manage (kept as provenance). */
  unmappedColumns: string[];
  rows: VehicleImportRow[];
  createdAt: string;
  createdBy: UserRef;
  appliedAt: string | null;
}

/** Where a case's data came from when it was created or updated by an import. */
export interface CaseProvenance {
  importId: string;
  fileName: string;
  rowNo: number;
  outcome: VehicleImportOutcome;
  appliedAt: string | null;
  appliedBy: UserRef;
  source: Record<string, string>;
}
