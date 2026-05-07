# 05 — Fase 0.5: Web Next.js + Login

> **Duração estimada:** 2 a 3 dias (solo dev)
> **Pré-requisitos:** Fase 0.4 concluída (API com `/auth/*` e `/me` funcionando).
> **Última atualização:** 2026-05-07
> **Status:** Pendente — não iniciada

---

## 1. Objetivo

No fim da Fase 0.5, o sistema deve ter:

- ✅ `apps/web` rodando com **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui**
- ✅ Página `/login` (e-mail + senha + tenant slug opcional) que chama a API
- ✅ Sessão **server-side via cookies httpOnly** — cliente nunca vê tokens crus
- ✅ Middleware que redireciona rotas autenticadas para `/login` quando não há sessão
- ✅ Página `/dashboard` que mostra dados do `/me` (nome, e-mail, role, tenant)
- ✅ Logout que chama `/auth/logout` na API e limpa cookies
- ✅ **Refresh automático**: ao receber 401 da API, o servidor Next.js tenta `/auth/refresh` e atualiza os cookies; falha → manda para `/login`
- ✅ Variáveis de ambiente do `web` documentadas em `.env.example`

**Critério de "feito":**

```
1. Rodar pnpm -F @crm-nexa/web dev → http://localhost:3000 sobe
2. Visitar /dashboard sem sessão → redireciona para /login
3. Login com owner@nexa.dev / dev123! → redireciona para /dashboard
4. /dashboard mostra "Dev Owner — owner — Nexa Dev"
5. Apertar logout → cookies limpos, /dashboard volta a redirecionar
6. Esperar acesso expirar (ou forçar) → próxima request renova via refresh
   transparentemente; reuso de refresh já revogado força logout
```

---

## 2. Sub-fases

A Fase 0.5 é dividida em 5 sub-sub-fases sequenciais.

### Sub-fase 0.5.A — Bootstrap `apps/web` (0.5 dia)

**Saída:** Next.js rodando em `localhost:3000` com Tailwind + shadcn instalados, página inicial com link para `/login`.

- Criar `apps/web` com `create-next-app` (App Router, TS, Tailwind, ESLint, src/)
- Integrar ao monorepo (workspace, tsconfig estende base, scripts no `package.json`)
- Instalar e configurar **shadcn/ui** (`npx shadcn init`)
- Adicionar componentes base do shadcn (`button`, `input`, `label`, `card`, `form`)
- Página `/` (root) com card "Você está em ambiente dev" + link para `/login`
- Configuração de env tipada (Zod) em `apps/web/src/env.ts` lendo `.env`
- `apps/web/README.md` com instruções

### Sub-fase 0.5.B — Página de login + server action (1 dia)

**Saída:** `/login` funcional, faz POST na API e seta cookies em sucesso.

- Página `/login` (Server Component) com formulário (`Form` do shadcn + `react-hook-form` + `zod`)
- Server Action `loginAction(formData)`:
  - Valida payload com Zod
  - `fetch(API_URL + '/auth/login', { POST, body, headers })`
  - Em sucesso: armazena `accessToken` e `refreshToken` em **dois cookies httpOnly**:
    - `nexa_access` — TTL ~15min, `Secure` em prod, `SameSite=Lax`
    - `nexa_refresh` — TTL ~7d, `Secure` em prod, `SameSite=Lax`
    - Path `/`, sem domínio explícito (escopo do app)
  - Redireciona para `/dashboard`
- Mensagens de erro inline (credencial inválida, tenant required, etc.)
- Tela acessível (label, aria, tabindex), responsiva
- Decisões de segurança: **cookies httpOnly nunca expostos a JS do cliente**; nenhum acesso direto a `accessToken` no client component

### Sub-fase 0.5.C — Middleware + `/dashboard` + `/me` (0.5 dia)

**Saída:** rotas autenticadas protegidas; dashboard mostra dados do user logado.

- `apps/web/src/middleware.ts`:
  - Lista de paths protegidos (`/dashboard`, `/dashboard/*`, ...)
  - Sem `nexa_refresh` → redirect 307 para `/login?next=...`
  - Com `nexa_refresh` mas sem `nexa_access` → continua (refresh fará no servidor)
- Helper `apiServerFetch(path, init)` em `apps/web/src/lib/api.ts`:
  - Server-side only — usa `cookies()` para ler `nexa_access`
  - Adiciona `Authorization: Bearer <access>`
  - Em 401: tenta refresh (vide 0.5.D) — se falhar, lança redirect para `/login`
- Página `/dashboard`:
  - Server Component que faz `apiServerFetch('/me')`
  - Renderiza nome, e-mail, role, tenant, plano
  - Header com "Sair" (form com server action de logout)
- Server Action `logoutAction`:
  - `fetch(API_URL + '/auth/logout', { POST, Authorization })`
  - Apaga `nexa_access` e `nexa_refresh` cookies
  - Redireciona para `/login`

### Sub-fase 0.5.D — Refresh automático + tratamento de 401 (0.5 dia)

**Saída:** sessão dura até o refresh expirar; access curto não atrapalha.

- Função `refreshAccess()` em `apps/web/src/lib/auth.ts`:
  - Lê `nexa_refresh` dos cookies
  - `fetch(API_URL + '/auth/refresh', { POST, body: { refreshToken } })`
  - Sucesso: regrava `nexa_access` e `nexa_refresh` (rotacionado)
  - Falha (401, theft): apaga cookies, lança redirect para `/login`
- `apiServerFetch` chama `refreshAccess()` em qualquer 401, retenta uma vez
- Teste manual: setar `JWT_ACCESS_TTL=15s` no `.env`, recarregar `/dashboard` após 16s — deve renovar transparentemente

### Sub-fase 0.5.E — Polimento + docs (0.5 dia)

**Saída:** UX aceitável + docs atualizadas, PR aberto.

- Loading states (`useFormStatus` + skeleton no dashboard)
- Mensagens de erro humanas (e não JSON cru)
- `apps/web/.env.example` (ou seção em `.env.example` da raiz) listando: `NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL` (se vier a usar), `WEB_PORT`
- README de `apps/web` com como rodar localmente
- Atualizar `docs/03` marca 0.5 ✅, este doc atualiza status com histórico
- Atualizar `CLAUDE.md` (seção "Estado da implementação")
- Abrir PR `feat/web-login`

---

## 3. Stack adicional para 0.5

| Pacote | Função |
|---|---|
| `next` 15+ | Framework |
| `react` 19, `react-dom` 19 | |
| `tailwindcss` v4 + `postcss` | Estilo |
| `@radix-ui/*` (via shadcn) | Primitivos acessíveis |
| `react-hook-form` + `@hookform/resolvers` | Formulários |
| `zod` | Validação (compartilhada com server action) |
| `lucide-react` | Ícones (default do shadcn) |
| `clsx`, `tailwind-merge`, `class-variance-authority` | Utilitários do shadcn |

> **Não vai entrar:** NextAuth/Auth.js (overkill para MVP — manual cookie management é suficiente). Server Components + Server Actions cobrem tudo.

---

## 4. Decisões importantes da fase

### 4.1 Onde guardar tokens

**Decisão:** httpOnly cookies, gerenciados pelo servidor Next.js.

- Cliente (browser) **nunca** tem acesso aos tokens via JavaScript.
- Server Components e Server Actions leem via `cookies()` API.
- Vantagem: imune a XSS no client. Desvantagem: precisa pensar em CSRF (mitigado por `SameSite=Lax` + Server Actions com origin check do Next.js).

### 4.2 API client direto vs. proxy server-side

**Decisão:** **proxy via Server Actions / Route Handlers**.

- Browser nunca chama a API diretamente.
- Toda chamada autenticada passa por `apiServerFetch`, que tem acesso aos cookies e injeta o Bearer.
- Permite que `NEXT_PUBLIC_API_URL` aponte para `http://localhost:3001` em dev e `https://api.crm-dev.nexasource.com.br` em staging — controlado server-side.

### 4.3 Validação compartilhada

**Decisão:** schema Zod do `LoginDto` espelhado no Next.js, **não** importado direto da API.

- API tem class-validator; web tem Zod.
- Em fase futura podemos extrair para `@crm-nexa/shared/schemas` e gerar ambos. Por enquanto, duplicar é mais barato que abstrair.

### 4.4 Refresh strategy

**Decisão:** refresh **lazy** via 401 retry, não via timer no cliente.

- Cliente não conhece o `exp` (token está em cookie httpOnly).
- Toda requisição server-side passa por `apiServerFetch`. Em 401 → tenta refresh → retry uma vez.
- Mais simples que polling de expiração; aceita o custo de uma round-trip extra a cada 15min.

---

## 5. Estrutura de diretórios após 0.5

```
apps/
  web/
    src/
      app/
        layout.tsx
        page.tsx                  ← landing simples
        login/
          page.tsx                ← Server Component
          actions.ts              ← loginAction server action
        dashboard/
          page.tsx                ← Server Component (chama /me)
          actions.ts              ← logoutAction
      components/
        ui/                       ← shadcn primitives
        login-form.tsx
      lib/
        api.ts                    ← apiServerFetch
        auth.ts                   ← refreshAccess, cookie helpers
      env.ts                      ← Zod-validated env
      middleware.ts               ← guard de rotas
    public/
    .env.example                  ← ou seção no .env.example raiz
    next.config.ts
    package.json
    tailwind.config.ts
    tsconfig.json
    README.md
```

---

## 6. Convenções de código

- **Server Components por default**, Client Components só quando necessário (interatividade, browser-only APIs).
- **Server Actions** para qualquer mutação que envolva cookies/auth.
- **Cores e tipografia:** Tailwind tokens default (não criar paleta nova ainda — virá com a identidade visual em fase posterior).
- **Português (pt-BR)** em UI/erros visíveis; código e logs em inglês.
- Acessibilidade básica: `<label>` com `htmlFor`, `aria-invalid`, `aria-describedby` para mensagens de erro.

---

## 7. Riscos e mitigações da fase

| Risco | Mitigação |
|---|---|
| Token vazando para o cliente | httpOnly + nunca tocar tokens em Client Components. Code review marca essa regra. |
| CSRF em mutations | Next.js Server Actions já validam origem; `SameSite=Lax` nos cookies. |
| Cookie sem `Secure` em prod | `process.env.NODE_ENV === 'production' ? Secure : false` no momento de set. |
| Refresh em loop infinito após theft | `refreshAccess()` lança redirect-to-login no 401, sem retry. |
| Build do shared não rodar | `prepare` da shared já configurado em 0.4; `pnpm install` cobre. |

---

## 8. Definição de "Fase 0.5 concluída"

- [ ] `pnpm -F @crm-nexa/web dev` sobe sem erro em `:3000`
- [ ] `/login` renderiza, valida campos, mostra erros
- [ ] Login com `owner@nexa.dev` / `dev123!` redireciona para `/dashboard`
- [ ] `/dashboard` mostra user + tenant corretamente
- [ ] Cookies `nexa_access` e `nexa_refresh` setados como httpOnly (verificado via DevTools)
- [ ] Acesso a `/dashboard` sem cookies → redireciona para `/login`
- [ ] Logout limpa cookies e redireciona para `/login`
- [ ] Forçando `JWT_ACCESS_TTL=15s` na API e recarregando `/dashboard` após expirar → renovação automática (sem voltar pra login)
- [ ] PR aberto, mergeado, branch limpa
- [ ] `docs/03` marca 0.5 ✅, este doc atualiza com histórico de execução

---

## 9. O que NÃO entra na Fase 0.5

- Recuperação de senha
- Cadastro/registration de novo tenant — Fase 1
- MFA na UI — pós-MVP
- Tema escuro / customização visual — fase de identidade visual
- Internacionalização (i18n) — só pt-BR por enquanto
- Componentes do CRM em si (contatos, deals, pipeline) — Fase 1+
- Storybook ou design system — pós-MVP
