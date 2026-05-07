export interface JwtAccessPayload {
  sub: string;
  tenantId: string;
  role: string;
  sid: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
  sid: string;
}
