import { redirect } from 'next/navigation';
import { env } from '@/env';
import { getAccessToken } from './cookies';

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

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  lastLoginAt: string | null;
  tenant: { id: string; slug: string; name: string; plan: string };
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

// Server-side fetch para a API. Le o nexa_access dos cookies e injeta
// como Bearer. Em 401, redireciona para /login (sem limpar cookies —
// modificar cookies em RSC nao e permitido; isso fica para a server
// action de logout / o refresh logic da 0.5.D).
export async function apiServerFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const access = await getAccessToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (access) headers.Authorization = `Bearer ${access}`;

  const resp = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (resp.status === 401) {
    redirect('/login');
  }
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(resp.status, body);
  }
  return (await resp.json()) as T;
}

export function apiMe(): Promise<MeResponse> {
  return apiServerFetch<MeResponse>('/me');
}

// =====================================================================
// Contacts
// =====================================================================
export type ContactStage = 'lead' | 'prospect' | 'customer' | 'churned';

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  companyName: string | null;
  stage: ContactStage;
  source: string | null;
  ownerId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListContactsResponse {
  data: Contact[];
  meta: ListMeta;
}

export interface ListContactsQuery {
  q?: string;
  stage?: ContactStage;
  ownerId?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

function buildContactsQuery(q: ListContactsQuery): string {
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.stage) params.set('stage', q.stage);
  if (q.ownerId) params.set('ownerId', q.ownerId);
  if (q.tag) params.set('tag', q.tag);
  if (q.page && q.page > 1) params.set('page', String(q.page));
  if (q.pageSize && q.pageSize !== 25) params.set('pageSize', String(q.pageSize));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function apiListContacts(
  query: ListContactsQuery = {},
): Promise<ListContactsResponse> {
  return apiServerFetch<ListContactsResponse>(
    `/contacts${buildContactsQuery(query)}`,
  );
}
