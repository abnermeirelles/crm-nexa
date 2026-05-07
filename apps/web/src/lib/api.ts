import { env } from '@/env';

export interface LoginPayload {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

export interface ApiErrorBody {
  message?: string | string[];
  code?: string;
  statusCode?: number;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(`API ${status}`);
  }
}

export async function apiLogin(payload: LoginPayload): Promise<LoginResponse> {
  const resp = await fetch(`${env.API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(resp.status, body);
  }
  return (await resp.json()) as LoginResponse;
}
