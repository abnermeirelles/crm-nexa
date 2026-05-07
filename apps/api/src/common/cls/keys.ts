export const TENANT_ID_KEY = 'tenantId';
export const USER_ID_KEY = 'userId';
export const ROLE_KEY = 'role';

export interface RequestContext {
  [TENANT_ID_KEY]?: string;
  [USER_ID_KEY]?: string;
  [ROLE_KEY]?: string;
}
