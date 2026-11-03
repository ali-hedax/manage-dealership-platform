import type { Role } from './enums';

// Permission strings checked by the API (authoritative) and used by the web
// app only to hide controls the user could not use anyway.
export const PERMISSIONS = [
  'case.read',
  'case.create',
  'case.update',
  'customer.pii.read', // full phone numbers and contact details
  'task.manage', // create tasks, record start/complete on behalf of technicians
  'task.approve', // supervisor approval of completed work
  'blocker.report',
  'blocker.manage', // acknowledge / resolve
  'assessment.manage', // draft and finalize assessments and supplements
  'assessment.authorize', // record an external authorization decision
  'part.request', // register part needs (manual, from assessment, Excel import)
  'part.manage', // stock, reservation, order, receipt, handover
  'finance.propose', // customer/insurer shares, propose advance or exception
  'finance.approve', // approve spending (never one's own proposal)
  'finance.payment', // confirm receipt of an advance, record settlement payments
  'finance.close', // financial close; closing with a balance due also needs finance.approve
  'qc.inspect', // record a QC round; failed items open corrective work
  'case.technical_close', // technical close after a passed QC round
  'case.deliver', // vehicle handover to the recipient
  'case.import', // bulk import of existing vehicles from Excel (preview, apply, results)
  'report.manager', // dealership-wide report of the service manager
  'dashboard.read',
  'audit.read',
  'user.manage',
  'settings.manage',
  'reference.parts.read',
  'reference.parts.manage',
  'reference.customers.read',
  'reference.customers.manage',
  'daily_reports.upload', // upload and preview the daily stock and Emdad files (no customer contact data)
  'daily_reports.apply', // publish a previewed daily file
  'daily_reports.settings', // reminder time/assignee; stock confirmations also need the owner
  'stock.read', // stock options, availability and Manage reservations
  'stock.reserve', // reserve an exact stock code for a part need
  'stock.release', // release a reservation or cancel a recorded issue
  'stock.issue', // record the issue from the warehouse and its reflection in the stock report
  'emdad.read', // Emdad Vijeh follow-up list and history
  'emdad.manage', // internal follow-up fields and review of case matching
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  accident_expert: [
    'case.read',
    'case.create',
    'reference.parts.read',
    'reference.customers.read',
    'case.update',
    'customer.pii.read',
    'blocker.report',
    'assessment.manage',
    'assessment.authorize',
    'part.request',
    'finance.propose',
    'case.deliver',
    'dashboard.read',
    'audit.read',
    'stock.read',
    'emdad.read',
  ],
  accident_supervisor: [
    'reference.parts.read',
    'reference.customers.read',
    'case.read',
    'case.create',
    'case.update',
    'customer.pii.read',
    'task.manage',
    'task.approve',
    'blocker.report',
    'blocker.manage',
    'assessment.manage',
    'assessment.authorize',
    'part.request',
    'part.manage',
    'finance.propose',
    'qc.inspect',
    'case.technical_close',
    'case.deliver',
    'dashboard.read',
    'audit.read',
    'stock.read',
    'stock.reserve',
    'stock.release',
    'emdad.read',
    'emdad.manage',
  ],
  service_manager: [
    'reference.parts.read',
    'reference.parts.manage',
    'reference.customers.read',
    'reference.customers.manage',
    'case.read',
    'case.create',
    'case.update',
    'customer.pii.read',
    'task.manage',
    'task.approve',
    'blocker.report',
    'blocker.manage',
    'assessment.manage',
    'assessment.authorize',
    'part.request',
    'part.manage',
    'finance.propose',
    'finance.approve',
    'finance.close',
    'qc.inspect',
    'case.technical_close',
    'case.deliver',
    'case.import',
    'report.manager',
    'dashboard.read',
    'audit.read',
    'settings.manage',
    'daily_reports.upload',
    'daily_reports.apply',
    'daily_reports.settings',
    'stock.read',
    'stock.reserve',
    'stock.release',
    'stock.issue',
    'emdad.read',
    'emdad.manage',
  ],
  // Support roles see cases without customer contact details.
  parts_clerk: ['case.read', 'blocker.report', 'part.request', 'part.manage', 'dashboard.read', 'reference.parts.read', 'reference.parts.manage', 'daily_reports.upload', 'daily_reports.apply', 'stock.read', 'stock.reserve', 'stock.release', 'stock.issue', 'emdad.read', 'emdad.manage'],
  cashier: ['case.read', 'customer.pii.read', 'finance.payment', 'finance.close', 'dashboard.read'],
  qc_inspector: ['case.read', 'blocker.report', 'qc.inspect', 'dashboard.read'],
  // Least privilege: administers accounts, does not read customer cases.
  // Uploading the daily files needs neither finance nor customer contact access.
  system_admin: ['user.manage', 'settings.manage', 'daily_reports.upload', 'daily_reports.apply'],
};

export type PermissionTemplates = Partial<Record<Role, Permission[]>>;
export type PermissionOverrides = { allow: Permission[]; deny: Permission[] };

export function permissionsFor(roles: readonly Role[], templates: PermissionTemplates = {}, overrides?: PermissionOverrides | null, isOwner = false): Set<Permission> {
  if (isOwner) return new Set(PERMISSIONS);
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of templates[role] ?? ROLE_PERMISSIONS[role] ?? []) if (PERMISSIONS.includes(p)) result.add(p);
  }
  for (const p of overrides?.allow ?? []) if (PERMISSIONS.includes(p)) result.add(p);
  for (const p of overrides?.deny ?? []) result.delete(p);
  return result;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}
