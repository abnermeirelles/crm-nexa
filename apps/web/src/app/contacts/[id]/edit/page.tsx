import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { ApiError, apiGetContact } from '@/lib/api';
import { EditContactForm } from './edit-form';

export const metadata = {
  title: 'Editar contato — CRM Nexa',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContactPage({ params }: PageProps) {
  const { id } = await params;
  let contact;
  try {
    contact = await apiGetContact(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href={`/contacts/${contact.id}`} className="hover:underline">
              ← {contact.name}
            </Link>
          </p>
          <h1 className="text-xl font-semibold">Editar contato</h1>
        </div>
        <Link
          href={`/contacts/${contact.id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Cancelar
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Dados do contato</CardTitle>
            <CardDescription>
              Campos em branco serão limpos. Tags separadas por vírgula.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditContactForm contact={contact} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
