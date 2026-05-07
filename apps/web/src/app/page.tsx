import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>CRM Nexa</CardTitle>
          <CardDescription>
            Ambiente de desenvolvimento. Faça login para acessar o painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/login" className={buttonVariants({ size: 'lg' })}>
            Fazer login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
