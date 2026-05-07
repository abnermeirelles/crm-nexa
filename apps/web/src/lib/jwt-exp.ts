// Edge-safe: usa atob(), nao depende de Buffer/next-headers.
// Faz parsing do payload do JWT SEM verificar assinatura — confiamos
// no cookie httpOnly que so foi setado pelo proprio servidor; isso
// e apenas para checar exp e decidir se vale a pena tentar refresh.

export function getAccessExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as { exp?: unknown };
    return typeof data.exp === 'number' ? data.exp : null;
  } catch {
    return null;
  }
}

export function isAccessExpiringSoon(
  token: string,
  bufferSec = 30,
): boolean {
  const exp = getAccessExp(token);
  if (exp === null) return true;
  return exp * 1000 - Date.now() < bufferSec * 1000;
}
