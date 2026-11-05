import type { Permission, Role } from '@manage/shared';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  isOwner?: boolean;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  isTestTenant: boolean;
  username: string;
  displayName: string;
  roles: Role[];
  permissions: Set<Permission>;
  sessionId: string;
  verifiedWithTotp?: boolean;
}

/** Who did something, from where — attached to every audited change. */
export interface Actor {
  user: AuthUser;
  requestId?: string;
  ip?: string;
}

export type AuthedRequest = Request & { id?: string; user?: AuthUser };

export const SESSION_COOKIE = 'manage_session';
