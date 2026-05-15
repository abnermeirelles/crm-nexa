import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError, apiGetContact, type ContactStage } from '@/lib/api';
import { deleteContactAction } from './actions';
import { Timeline } from './_components/timeline';

export const metadata = {
  title: 'Contato — CRM Nexa',
};

const STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Cliente',
  churned: 'Churn',
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  let contact;
  try {
    contact = await apiGetContact(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const deleteWithId = deleteContactAction.bind(null, contact.id);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/contacts" className="hover:underline">
              ← Contatos
            </Link>
          </p>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/contacts/${contact.id}/edit`}
            className={buttonVariants({ size: 'sm' })}
          >
            Editar
          </Link>
          <form action={deleteWithId}>
            <Button type="submit" variant="destructive" size="sm">
              Excluir
            </Button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {contact.name}
              <Badge variant="secondary">{STAGE_LABEL[contact.stage]}</Badge>
            </CardTitle>
            <CardDescription>
              Criado em {dateLabel(contact.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail" value={contact.email} />
            <Field label="Telefone" value={contact.phone} />
            <Field label="CPF/CNPJ" value={contact.document} />
            <Field label="Empresa" value={contact.companyName} />
            <Field label="Origem" value={contact.source} />
            <Field
              label="Tags"
              value={contact.tags.length > 0 ? contact.tags.join(', ') : null}
            />
            <Field
              label="Atualizado em"
              value={dateLabel(contact.updatedAt)}
            />
          </CardContent>
          <Timeline contactId={contact.id} />
        </Card>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  );
}
