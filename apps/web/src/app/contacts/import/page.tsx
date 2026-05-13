import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { ImportForm } from './import-form';

export const metadata = {
  title: 'Importar CSV — CRM Nexa',
};

export default function ImportContactsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/contacts" className="hover:underline">
              ← Contatos
            </Link>
          </p>
          <h1 className="text-xl font-semibold">Importar contatos via CSV</h1>
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
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>
              Cabeçalhos esperados (case-insensitive):{' '}
              <code className="text-foreground">
                name, email, phone, document, companyName, stage, source, tags
              </code>
              .
              <br />
              Apenas <code className="text-foreground">name</code> é obrigatório.
              CPF/CNPJ deve conter só dígitos (11 ou 14). Stage:{' '}
              <code className="text-foreground">
                lead | prospect | customer | churned
              </code>
              . Tags separadas por <code className="text-foreground">;</code>.
              <br />
              Dedup por e-mail dentro do tenant (linhas com mesmo e-mail
              atualizam um contato existente).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
