import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { ContactForm } from '../_components/contact-form';
import { createContactAction } from './actions';

export const metadata = {
  title: 'Novo contato — CRM Nexa',
};

export default function NewContactPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Novo contato</h1>
          <p className="text-xs text-muted-foreground">
            Preencha os dados e salve. Só o nome é obrigatório.
          </p>
        </div>
        <Link
          href="/contacts"
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
              Tags separadas por vírgula. CPF/CNPJ apenas dígitos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContactForm action={createContactAction} submitLabel="Criar contato" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
