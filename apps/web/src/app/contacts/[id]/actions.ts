'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  ApiError,
  apiCreateActivity,
  apiDeleteActivity,
  apiDeleteContact,
} from '@/lib/api';
import type { AddNoteState } from './state';

export async function deleteContactAction(id: string): Promise<void> {
  await apiDeleteContact(id);
  revalidatePath('/contacts');
  redirect('/contacts');
}

export async function addNoteAction(
  contactId: string,
  _prev: AddNoteState,
  formData: FormData,
): Promise<AddNoteState> {
  const raw = formData.get('body');
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) {
    return { error: 'Escreva alguma coisa para salvar a nota.' };
  }
  if (body.length > 10_000) {
    return { error: 'Nota muito longa (max 10000 chars).' };
  }

  try {
    await apiCreateActivity(contactId, { type: 'note', body });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        return { error: 'Contato nao encontrado.' };
      }
      return { error: 'Erro ao salvar nota. Tente novamente.' };
    }
    return { error: 'Falha de conexao.' };
  }

  revalidatePath(`/contacts/${contactId}`);
  return { error: null };
}

export async function deleteActivityAction(
  activityId: string,
): Promise<void> {
  try {
    await apiDeleteActivity(activityId);
  } catch {
    // Best-effort
  }
  revalidatePath('/contacts/[id]', 'page');
}
