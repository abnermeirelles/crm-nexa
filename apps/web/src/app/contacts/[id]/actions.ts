'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiDeleteContact } from '@/lib/api';

export async function deleteContactAction(id: string): Promise<void> {
  await apiDeleteContact(id);
  revalidatePath('/contacts');
  redirect('/contacts');
}
