import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { apiMe } from '@/lib/api';
import { logoutAction } from './actions';

export const metadata = {
  title: 'Dashboard — CRM Nexa',
};

export default async function DashboardPage() {
  const me = await apiMe();

  const lastLogin = me.lastLoginAt
    ? new Date(me.lastLoginAt).toLocaleString('pt-BR')
    : '—';

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {me.tenant.name}
          </p>
          <p className="text-sm font-medium">{me.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/contacts"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Contatos
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Bem-vindo, {me.name}</CardTitle>
            <CardDescription>
              Você está autenticado no CRM Nexa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuário" value={me.email} />
            <Field label="Papel" value={me.role} />
            <Field label="Tenant" value={`${me.tenant.name} (${me.tenant.slug})`} />
            <Field label="Plano" value={me.tenant.plan} />
            <Field label="Último login" value={lastLogin} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
