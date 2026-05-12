export interface ContactFormState {
  error: string | null;
  fieldErrors: Partial<Record<ContactFormField, string[]>>;
}

export type ContactFormField =
  | 'name'
  | 'email'
  | 'phone'
  | 'document'
  | 'companyName'
  | 'stage'
  | 'source'
  | 'tags';

export const initialContactFormState: ContactFormState = {
  error: null,
  fieldErrors: {},
};
