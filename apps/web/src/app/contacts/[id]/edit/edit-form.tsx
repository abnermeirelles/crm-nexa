'use client';

import type { Contact } from '@/lib/api';
import { ContactForm } from '../../_components/contact-form';
import { updateContactAction } from './actions';

// Wrapper client component que faz bind do id no action antes de
// passar para o ContactForm (que usa useActionState e nao aceita
// argumentos extras).
export function EditContactForm({ contact }: { contact: Contact }) {
  const action = updateContactAction.bind(null, contact.id);
  return (
    <ContactForm
      initial={contact}
      action={action}
      submitLabel="Salvar alterações"
    />
  );
}
