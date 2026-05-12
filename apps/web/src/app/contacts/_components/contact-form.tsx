'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Contact, ContactStage } from '@/lib/api';
import {
  initialContactFormState,
  type ContactFormState,
} from '../_lib/state';

const STAGES: ContactStage[] = ['lead', 'prospect', 'customer', 'churned'];
const STAGE_LABEL: Record<ContactStage, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Cliente',
  churned: 'Churn',
};

type FormAction = (
  prev: ContactFormState,
  formData: FormData,
) => Promise<ContactFormState>;

export function ContactForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: Contact;
  action: FormAction;
  submitLabel: string;
}) {
  const [state, dispatch, pending] = useActionState(
    action,
    initialContactFormState,
  );

  return (
    <form action={dispatch} className="flex flex-col gap-5">
      <Field
        id="name"
        label="Nome"
        required
        defaultValue={initial?.name ?? ''}
        errors={state.fieldErrors.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="email"
          label="E-mail"
          type="email"
          defaultValue={initial?.email ?? ''}
          errors={state.fieldErrors.email}
        />
        <Field
          id="phone"
          label="Telefone"
          defaultValue={initial?.phone ?? ''}
          errors={state.fieldErrors.phone}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="document"
          label="CPF/CNPJ"
          placeholder="apenas digitos"
          defaultValue={initial?.document ?? ''}
          errors={state.fieldErrors.document}
        />
        <Field
          id="companyName"
          label="Empresa"
          defaultValue={initial?.companyName ?? ''}
          errors={state.fieldErrors.companyName}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stage">Stage</Label>
          <select
            id="stage"
            name="stage"
            defaultValue={initial?.stage ?? 'lead'}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="source"
          label="Origem"
          placeholder="ex.: whatsapp, csv-import"
          defaultValue={initial?.source ?? ''}
          errors={state.fieldErrors.source}
        />
      </div>

      <Field
        id="tags"
        label="Tags"
        placeholder="separadas por virgula"
        defaultValue={initial?.tags?.join(', ') ?? ''}
        errors={state.fieldErrors.tags}
      />

      {state.error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  errors?: string[];
}

function Field({
  id,
  label,
  type = 'text',
  defaultValue,
  placeholder,
  required,
  errors,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        aria-invalid={Boolean(errors?.length)}
      />
      {errors && errors.length > 0 && (
        <p className="text-xs text-destructive">{errors[0]}</p>
      )}
    </div>
  );
}
