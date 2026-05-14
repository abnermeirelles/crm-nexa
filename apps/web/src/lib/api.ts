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
  // 204 No Content (ex.: DELETE) ou body vazio — retorna undefined.
  if (resp.status === 204 || resp.headers.get('content-length') === '0') {
    return undefined as T;
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

export interface ContactCreatePayload {
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  companyName?: string;
  stage?: ContactStage;
  source?: string;
  ownerId?: string;
  tags?: string[];
}
export type ContactUpdatePayload = Partial<ContactCreatePayload>;

export function apiGetContact(id: string): Promise<Contact> {
  return apiServerFetch<Contact>(`/contacts/${id}`);
}

export function apiCreateContact(
  payload: ContactCreatePayload,
): Promise<Contact> {
  return apiServerFetch<Contact>('/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function apiUpdateContact(
  id: string,
  payload: ContactUpdatePayload,
): Promise<Contact> {
  return apiServerFetch<Contact>(`/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function apiDeleteContact(id: string): Promise<void> {
  return apiServerFetch<void>(`/contacts/${id}`, { method: 'DELETE' });
}

// =====================================================================
// Contact imports (CSV)
// =====================================================================
export type ContactImportStatus =
  | 'queued'
  | 'processing'
  | 'done'
  | 'failed';

export interface ContactImportRowError {
  row: number;
  message: string;
}

export interface ContactImport {
  id: string;
  filename: string;
  status: ContactImportStatus;
  totalRows: number;
  processedRows: number;
  insertedRows: number;
  updatedRows: number;
  errorRows: number;
  errors: ContactImportRowError[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function apiStartContactImport(
  file: File,
): Promise<{ importId: string }> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  // FormData precisa de Content-Type com boundary — deixar fetch
  // calcular sozinho.
  const access = await getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (access) headers.Authorization = `Bearer ${access}`;

  const resp = await fetch(`${env.API_URL}/contacts/imports`, {
    method: 'POST',
    headers,
    body: fd,
    cache: 'no-store',
  });
  if (resp.status === 401) {
    redirect('/login');
  }
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(resp.status, body);
  }
  return (await resp.json()) as { importId: string };
}

export function apiGetContactImport(id: string): Promise<ContactImport> {
  return apiServerFetch<ContactImport>(`/contacts/imports/${id}`);
}

// =====================================================================
// Activities (timeline do contato)
// =====================================================================
export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'system';

export interface Activity {
  id: string;
  contactId: string;
  type: ActivityType;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  actorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListActivitiesResponse {
  data: Activity[];
  meta: ListMeta;
}

export interface CreateActivityPayload {
  type: Exclude<ActivityType, 'system'>;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export function apiListActivities(
  contactId: string,
  page = 1,
): Promise<ListActivitiesResponse> {
  const qs = page > 1 ? `?page=${page}` : '';
  return apiServerFetch<ListActivitiesResponse>(
    `/contacts/${contactId}/activities${qs}`,
  );
}

export function apiCreateActivity(
  contactId: string,
  payload: CreateActivityPayload,
): Promise<Activity> {
  return apiServerFetch<Activity>(`/contacts/${contactId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function apiDeleteActivity(id: string): Promise<void> {
  return apiServerFetch<void>(`/activities/${id}`, { method: 'DELETE' });
}
