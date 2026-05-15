import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiListContacts, type ContactStage } from '@/lib/api';
import { ContactsTable } from './_components/contacts-table';

export const metadata = {
  title: 'Contatos — CRM Nexa',
};

const STAGES: ContactStage[] = ['lead', 'prospect', 'customer', 'churned'];

const STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Cliente',
  churned: 'Churn',
};

interface ContactsPageProps {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    tag?: string;
    page?: string;
  }>;
}

function parseStage(value: string | undefined): ContactStage | undefined {
  if (!value) return undefined;
  return STAGES.includes(value as ContactStage)
    ? (value as ContactStage)
    : undefined;
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const stage = parseStage(params.stage);
  const tag = params.tag?.trim() || undefined;
  const page = parsePage(params.page);

  const { data, meta } = await apiListContacts({ q, stage, tag, page });

  const buildPageHref = (target: number): string => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (stage) sp.set('stage', stage);
    if (tag) sp.set('tag', tag);
    if (target > 1) sp.set('page', String(target));
    const s = sp.toString();
    return `/contacts${s ? `?${s}` : ''}`;
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Contatos</h1>
          <p className="text-xs text-muted-foreground">
            {meta.total === 0
              ? 'Nenhum contato ainda'
              : `${meta.total} ${meta.total === 1 ? 'contato' : 'contatos'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/contacts/import"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Importar CSV
          </Link>
          <Link href="/contacts/new" className={buttonVariants({ size: 'sm' })}>
            Novo contato
          </Link>
        </div>
      </header>

      <section className="border-b px-6 py-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="q">Busca</Label>
            <Input
              id="q"
              name="q"
              type="search"
              placeholder="Nome ou e-mail"
              defaultValue={q ?? ''}
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stage">Stage</Label>
            <select
              id="stage"
              name="stage"
              defaultValue={stage ?? ''}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="">Todos</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag">Tag</Label>
            <Input
              id="tag"
              name="tag"
              type="text"
              placeholder="ex: drogaria"
              defaultValue={tag ?? ''}
              className="w-40"
            />
          </div>
          <button type="submit" className={buttonVariants({ size: 'default' })}>
            Filtrar
          </button>
          {(q || stage || tag) && (
            <Link
              href="/contacts"
              className={buttonVariants({ variant: 'ghost', size: 'default' })}
            >
              Limpar
            </Link>
          )}
        </form>
      </section>

      <main className="flex-1 overflow-x-auto px-6 py-4">
        {data.length === 0 ? (
          <EmptyState hasFilters={Boolean(q || stage || tag)} />
        ) : (
          <ContactsTable contacts={data} />
        )}
      </main>

      {(meta.page > 1 || meta.hasMore) && (
        <footer className="flex items-center justify-between border-t px-6 py-3 text-sm">
          <span className="text-muted-foreground">
            Página {meta.page} · {meta.total} no total
          </span>
          <div className="flex gap-2">
            {meta.page > 1 && (
              <Link
                href={buildPageHref(meta.page - 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Anterior
              </Link>
            )}
            {meta.hasMore && (
              <Link
                href={buildPageHref(meta.page + 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Próxima
              </Link>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium">
        {hasFilters ? 'Nenhum contato com esses filtros' : 'Sem contatos ainda'}
      </p>
      {!hasFilters && (
        <p className="text-xs text-muted-foreground">
          Crie o primeiro contato ou importe um CSV.
        </p>
      )}
      <Link href="/contacts/new" className={buttonVariants({ size: 'sm' })}>
        Novo contato
      </Link>
    </div>
  );
}
