'use server';

import { redirect } from 'next/navigation';
import { env } from '@/env';
import { clearSessionCookies, getAccessToken } from '@/lib/cookies';

export async function logoutAction(): Promise<void> {
  const access = await getAccessToken();
  if (access) {
    try {
      await fetch(`${env.API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
        cache: 'no-store',
      });
    } catch {
      // Best-effort: mesmo se a API falhar, limpamos cookies localmente.
    }
  }
  await clearSessionCookies();
  redirect('/login');
}
