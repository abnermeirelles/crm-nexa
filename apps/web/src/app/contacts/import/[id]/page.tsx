import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ApiError,
  apiGetContactImport,
  type ContactImportStatus,
} from '@/lib/api';

export const metadata = {
  title: 'Status do import — CRM Nexa',
};

const STATUS_LABEL: Record<ContactImportStatus, string> = {
  queued: 'Na fila',
  processing: 'Processando',
  done: 'Concluído',
  failed: 'Falhou',
};

const STATUS_BADGE: Record<
  ContactImportStatus,
  'default' | 'secondary' | 'destructive'
> = {
  queued: 'secondary',
  processing: 'secondary',
  done: 'default',
  failed: 'destructive',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ImportStatusPage({ params }: PageProps) {
  const { id } = await params;
  let job;
  try {
    job = await apiGetContactImport(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const inProgress = job.status === 'queued' || job.status === 'processing';
  const startedLabel = job.startedAt
    ? new Date(job.startedAt).toLocaleString('pt-BR')
    : '—';
  const finishedLabel = job.finishedAt
    ? new Date(job.finishedAt).toLocaleString('pt-BR')
    : '—';

  return (
    <div className="flex flex-1 flex-col">
      {/* Auto-refresh a cada 2s enquanto em progresso (Server Component
          re-renderiza com dados frescos). */}
      {inProgress && <meta httpEquiv="refresh" content="2" />}

      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/contacts" className="hover:underline">
              ← Contatos
            </Link>
          </p>
          <h1 className="text-xl font-semibold">Status do import</h1>
        </div>
        <Link
          href="/contacts/import"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Novo import
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {job.filename}
              <Badge variant={STATUS_BADGE[job.status]}>
                {STATUS_LABEL[job.status]}
              </Badge>
            </CardTitle>
            <CardDescription>
              {inProgress
                ? 'Atualizando automaticamente a cada 2 segundos.'
                : 'Processamento finalizado.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Linhas totais" value={String(job.totalRows)} />
            <Field label="Processadas" value={String(job.processedRows)} />
            <Field label="Inseridas" value={String(job.insertedRows)} />
            <Field label="Atualizadas" value={String(job.updatedRows)} />
            <Field label="Erros" value={String(job.errorRows)} />
            <Field label="Início" value={startedLabel} />
            <Field label="Fim" value={finishedLabel} />
          </CardContent>

          {job.errors.length > 0 && (
            <CardContent className="border-t">
              <h3 className="mb-3 text-sm font-medium">
                Primeiros erros ({job.errors.length}{' '}
                {job.errors.length === 1 ? 'linha' : 'linhas'})
              </h3>
              <ul className="space-y-1 text-xs">
                {job.errors.slice(0, 20).map((e, i) => (
                  <li
                    key={`${e.row}-${i}`}
                    className="rounded-md bg-muted/50 px-2 py-1 font-mono"
                  >
                    linha {e.row}: {e.message}
                  </li>
                ))}
                {job.errors.length > 20 && (
                  <li className="text-muted-foreground">
                    ...e mais {job.errors.length - 20} erros
                  </li>
                )}
              </ul>
            </CardContent>
          )}

          {job.status === 'done' && (
            <CardContent className="border-t">
              <Link
                href="/contacts"
                className={buttonVariants({ size: 'sm' })}
              >
                Ver contatos
              </Link>
            </CardContent>
          )}
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
