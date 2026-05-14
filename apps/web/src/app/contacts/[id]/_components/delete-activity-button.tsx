'use client';

import { Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { deleteActivityAction } from '../actions';

export function DeleteActivityButton({
  activityId,
}: {
  activityId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      disabled={pending}
      aria-label="Excluir atividade"
      onClick={() => {
        startTransition(() => {
          void deleteActivityAction(activityId);
        });
      }}
    >
      <Trash2 className="size-3" />
    </Button>
  );
}
