'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { addNoteAction } from '../actions';
import { initialAddNoteState } from '../state';

export function AddNoteForm({ contactId }: { contactId: string }) {
  const boundAction = addNoteAction.bind(null, contactId);
  const [state, dispatch, pending] = useActionState(
    boundAction,
    initialAddNoteState,
  );

  return (
    <form action={dispatch} className="flex flex-col gap-2">
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Adicionar nota..."
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
        aria-invalid={Boolean(state.error)}
      />
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Salvando...' : 'Adicionar nota'}
        </Button>
      </div>
    </form>
  );
}
