'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  initialImportActionState,
  startImportAction,
} from './actions';

export function ImportForm() {
  const [state, action, pending] = useActionState(
    startImportAction,
    initialImportActionState,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">Arquivo CSV</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
        />
        <p className="text-xs text-muted-foreground">
          Até 10 MB. Encoding UTF-8.
        </p>
      </div>

      {state.error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enviando...' : 'Iniciar importação'}
        </Button>
      </div>
    </form>
  );
}
