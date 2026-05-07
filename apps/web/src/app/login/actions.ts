'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiLogin, ApiError } from '@/lib/api';
import { setSessionCookies } from '@/lib/cookies';
import type { LoginState } from './state';

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido').max(255),
  password: z.string().min(1, 'Senha obrigatória').max(128),
  tenantSlug: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

// Aceita apenas paths internos (prefixo /, sem // que sairia para outro
// host). Caso contrario cai no fallback /dashboard. Defesa contra
// open-redirect via parametro `next`.
function safeNext(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    tenantSlug: formData.get('tenantSlug'),
  });

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const tokens = await apiLogin(parsed.data);
    await setSessionCookies(tokens);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.body?.code === 'TENANT_REQUIRED') {
        return {
          error: 'Este e-mail está vinculado a múltiplos tenants. Informe o tenant slug.',
          fieldErrors: {},
        };
      }
      if (err.status === 401) {
        return { error: 'E-mail ou senha inválidos.', fieldErrors: {} };
      }
      if (err.status === 400) {
        return {
          error: 'Dados inválidos. Verifique os campos e tente novamente.',
          fieldErrors: {},
        };
      }
      return {
        error: 'Erro inesperado ao autenticar. Tente novamente.',
        fieldErrors: {},
      };
    }
    return {
      error: 'Não foi possível conectar ao servidor.',
      fieldErrors: {},
    };
  }

  redirect(safeNext(formData.get('next')));
}
