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
  'finance.payment', // confirm receipt of an advance
  'dashboard.read',
  'audit.read',
  'user.manage',
  'settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  accident_expert: [
    'case.read',
    'case.create',
    'case.update',
    'customer.pii.read',
    'blocker.report',
    'assessment.manage',
    'assessment.authorize',
    'part.request',
    'finance.propose',
    'dashboard.read',
    'audit.read',
  ],
  accident_supervisor: [
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
    'dashboard.read',
    'audit.read',
  ],
  service_manager: [
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
    'dashboard.read',
    'audit.read',
    'settings.manage',
  ],
  // Support roles see cases without customer contact details.
  parts_clerk: ['case.read', 'blocker.report', 'part.request', 'part.manage', 'dashboard.read'],
  cashier: ['case.read', 'customer.pii.read', 'finance.payment', 'dashboard.read'],
  qc_inspector: ['case.read', 'blocker.report', 'dashboard.read'],
  // Least privilege: administers accounts, does not read customer cases.
  system_admin: ['user.manage', 'settings.manage'],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) result.add(p);
  }
  return result;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}
