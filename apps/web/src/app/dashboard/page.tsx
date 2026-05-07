import { redirect } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getAccessToken } from '@/lib/cookies';

// Placeholder — sera substituido pela versao real (com /me + logout)
// na sub-fase 0.5.C.
export default async function DashboardPage() {
  const token = await getAccessToken();
  if (!token) redirect('/login');

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Você está autenticado. Conteúdo real (dados de /me + logout) entra
            na sub-fase 0.5.C.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cookie <code className="font-mono">nexa_access</code> presente —
          tamanho: {token.length} chars.
        </CardContent>
      </Card>
    </main>
  );
}
