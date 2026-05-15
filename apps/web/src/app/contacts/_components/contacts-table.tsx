'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Contact, ContactStage } from '@/lib/api';
import { bulkUpdateStageAction } from '../actions';

const STAGES: ContactStage[] = ['lead', 'prospect', 'customer', 'churned'];
const STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Cliente',
  churned: 'Churn',
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const allChecked =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someChecked = !allChecked && contacts.some((c) => selected.has(c.id));

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyStage = (stage: ContactStage) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const r = await bulkUpdateStageAction(ids, stage);
      setFeedback({ ok: r.ok, message: r.message });
      if (r.ok) setSelected(new Set());
    });
  };

  const selectedCount = selected.size;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Selecionar todos"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={toggleAll}
              />
            </TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Atualizado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.id} data-selected={selected.has(c.id)}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${c.name}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                />
              </TableCell>
              <TableCell className="font-medium">
                <Link href={`/contacts/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {c.email ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {c.phone ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{STAGE_LABEL[c.stage]}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {dateLabel(c.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Ações em lote"
          className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg"
        >
          <span className="text-sm font-medium">
            {selectedCount}{' '}
            {selectedCount === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <span className="text-muted-foreground" aria-hidden>
            |
          </span>
          <label
            htmlFor="bulk-stage"
            className="text-sm text-muted-foreground"
          >
            Mudar stage:
          </label>
          <select
            id="bulk-stage"
            disabled={pending}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as ContactStage;
              if (v) applyStage(v);
              e.target.value = '';
            }}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="" disabled>
              Escolher...
            </option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
              setFeedback(null);
            }}
            disabled={pending}
          >
            Limpar
          </Button>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`fixed inset-x-0 top-6 z-50 mx-auto w-fit rounded-md border px-4 py-2 text-sm shadow-lg ${
            feedback.ok
              ? 'border-primary/30 bg-primary/10 text-foreground'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
          onClick={() => setFeedback(null)}
        >
          {feedback.message}
        </div>
      )}
    </>
  );
}
