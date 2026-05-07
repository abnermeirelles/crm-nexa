export interface LoginState {
  error: string | null;
  fieldErrors: Partial<Record<'email' | 'password' | 'tenantSlug', string[]>>;
}

export const initialLoginState: LoginState = { error: null, fieldErrors: {} };
