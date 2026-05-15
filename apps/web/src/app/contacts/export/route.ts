import { redirect } from 'next/navigation';
import { env } from '@/env';
import { getAccessToken } from '@/lib/cookies';

// Route Handler que faz proxy do CSV da API. Necessario porque o
// download nao tem Bearer header — o browser navega via <a> e so
// envia cookies. Aqui leitamos o access da cookie httpOnly e
// reencaminhamos com Authorization: Bearer.
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  // Preserva os filtros da query string (q, stage, tag, ownerId).
  const target = new URL(`${env.API_URL}/contacts/export`);
  for (const [k, v] of incoming.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  const access = await getAccessToken();
  if (!access) {
    redirect('/login');
  }

  const resp = await fetch(target.toString(), {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'text/csv',
    },
    cache: 'no-store',
  });

  if (resp.status === 401) {
    redirect('/login');
  }
  if (!resp.ok) {
    return new Response('Erro ao exportar contatos', {
      status: resp.status,
    });
  }

  const filename = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
