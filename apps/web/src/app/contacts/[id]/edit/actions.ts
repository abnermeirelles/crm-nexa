'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiUpdateContact } from '@/lib/api';
import { ContactFormSchema } from '../../_lib/schema';
import type { ContactFormState } from '../../_lib/state';

export async function updateContactAction(
  contactId: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = ContactFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email') || undefined,
    phone: formData.get('phone') || undefined,
    document: formData.get('document') || undefined,
    companyName: formData.get('companyName') || undefined,
    stage: formData.get('stage') || undefined,
    source: formData.get('source') || undefined,
    tags: formData.get('tags') || undefined,
  });

  if (!parsed.success) {
    return {
      error: null,
      fieldErrors: parsed.error.flatten()
        .fieldErrors as ContactFormState['fieldErrors'],
    };
  }

  try {
    await apiUpdateContact(contactId, {
      name: parsed.data.name,
      // Campos vazios = string vazia no PATCH para limpar (API converte para null)
      email: parsed.data.email ?? '',
      phone: parsed.data.phone ?? '',
      document: parsed.data.document ?? '',
      companyName: parsed.data.companyName ?? '',
      stage: parsed.data.stage,
      source: parsed.data.source ?? '',
      tags: parsed.data.tags,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.body?.code === 'CONTACT_DUPLICATE_EMAIL') {
        return {
          error: 'Ja existe outro contato com este e-mail.',
          fieldErrors: { email: ['e-mail duplicado'] },
        };
      }
      if (err.status === 404) {
        return { error: 'Contato nao encontrado.', fieldErrors: {} };
      }
      if (err.status === 400) {
        return {
          error: err.body?.message
            ? Array.isArray(err.body.message)
              ? err.body.message.join('; ')
              : err.body.message
            : 'Dados invalidos.',
          fieldErrors: {},
        };
      }
      return { error: 'Erro inesperado ao salvar.', fieldErrors: {} };
    }
    return { error: 'Falha na conexao com o servidor.', fieldErrors: {} };
  }

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}
