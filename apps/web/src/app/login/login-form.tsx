'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from './actions';
import { initialLoginState } from './state';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialLoginState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors.email?.length)}
          aria-describedby={state.fieldErrors.email ? 'email-error' : undefined}
        />
        {state.fieldErrors.email && (
          <p id="email-error" className="text-xs text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors.password?.length)}
          aria-describedby={state.fieldErrors.password ? 'password-error' : undefined}
        />
        {state.fieldErrors.password && (
          <p id="password-error" className="text-xs text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenantSlug">
          Tenant <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="tenantSlug"
          name="tenantSlug"
          type="text"
          autoComplete="off"
          placeholder="ex.: dev"
          aria-invalid={Boolean(state.fieldErrors.tenantSlug?.length)}
          aria-describedby={state.fieldErrors.tenantSlug ? 'tenant-error' : undefined}
        />
        {state.fieldErrors.tenantSlug && (
          <p id="tenant-error" className="text-xs text-destructive">
            {state.fieldErrors.tenantSlug[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  );
}
