'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  apiBulkUpdateStage,
  type ContactStage,
} from '@/lib/api';

export interface BulkActionResult {
  ok: boolean;
  message: string;
  matched?: number;
  updated?: number;
}

export async function bulkUpdateStageAction(
  ids: string[],
  stage: ContactStage,
): Promise<BulkActionResult> {
  if (!ids || ids.length === 0) {
    return { ok: false, message: 'Nenhum contato selecionado.' };
  }
  try {
    const r = await apiBulkUpdateStage(ids, stage);
    revalidatePath('/contacts');
    return {
      ok: true,
      message:
        r.updated === 0
          ? `Nenhuma mudança (${r.matched} contatos já estavam no stage).`
          : `${r.updated} contatos atualizados.`,
      matched: r.matched,
      updated: r.updated,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      const msg = Array.isArray(err.body?.message)
        ? err.body.message.join('; ')
        : (err.body?.message as string | undefined);
      return {
        ok: false,
        message: msg ?? `Erro inesperado (${err.status}).`,
      };
    }
    return { ok: false, message: 'Falha de conexao com o servidor.' };
  }
}
