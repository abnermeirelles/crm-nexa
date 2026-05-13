'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiStartContactImport } from '@/lib/api';

export interface ImportActionState {
  error: string | null;
}

export const initialImportActionState: ImportActionState = { error: null };

export async function startImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo CSV para enviar.' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'Arquivo maior que 10 MB nao suportado.' };
  }

  let importId: string;
  try {
    const r = await apiStartContactImport(file);
    importId = r.importId;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.body?.code === 'FILE_TOO_LARGE') {
        return { error: 'Arquivo maior que 10 MB.' };
      }
      if (err.body?.code === 'NO_FILE') {
        return { error: 'Arquivo nao enviado corretamente.' };
      }
      return {
        error: `Erro do servidor (${err.status}): ${
          err.body?.message ?? 'tente novamente'
        }`,
      };
    }
    return { error: 'Falha de conexao com o servidor.' };
  }

  revalidatePath('/contacts');
  redirect(`/contacts/import/${importId}`);
}
