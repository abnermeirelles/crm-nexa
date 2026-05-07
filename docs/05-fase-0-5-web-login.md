# 05 — Fase 0.5: Web Next.js + Login

> **Duração estimada:** 2 a 3 dias (solo dev) — **executada em 2026-05-07**
> **Pré-requisitos:** Fase 0.4 concluída (API com `/auth/*` e `/me` funcionando).
> **Última atualização:** 2026-05-07
> **Status:** ✅ Concluída — vide §10 (Histórico de execução)

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

- [x] `pnpm -F @crm-nexa/web dev` sobe sem erro em `:3000`
- [x] `/login` renderiza, valida campos, mostra erros
- [x] Login com `owner@nexa.dev` / `dev123!` redireciona para `/dashboard` (validação manual no browser)
- [x] `/dashboard` mostra user + tenant corretamente
- [x] Cookies `nexa_access` e `nexa_refresh` setados como httpOnly (verificado via curl Set-Cookie)
- [x] Acesso a `/dashboard` sem cookies → redireciona para `/login` com `?next=<path>`
- [x] Logout limpa cookies e redireciona para `/login` (logoutAction)
- [x] Forçando `JWT_ACCESS_TTL=60s` na API e simulando access expirado (forjado com `exp=1`) → middleware refrescou transparentemente, rotação detectada via session id
- [ ] PR aberto, mergeado, branch limpa
- [x] `docs/03` marca 0.5 ✅, este doc atualiza com histórico de execução

---

## 9. O que NÃO entra na Fase 0.5

- Recuperação de senha
- Cadastro/registration de novo tenant — Fase 1
- MFA na UI — pós-MVP
- Tema escuro / customização visual — fase de identidade visual
- Internacionalização (i18n) — só pt-BR por enquanto
- Componentes do CRM em si (contatos, deals, pipeline) — Fase 1+
- Storybook ou design system — pós-MVP

---

## 10. Histórico de execução

### 0.5.A — Bootstrap `apps/web` (commit `0884065`)

- `apps/web` scaffolded via `create-next-app` (Next 16.2.4, React 19.2.4, Tailwind v4, ESLint 9, TS 5.7, App Router, src/, alias `@/*`).
- Integrado ao monorepo como `@crm-nexa/web` (workspace dep `@crm-nexa/shared`, scripts compatíveis com turbo).
- shadcn/ui inicializado (estilo `base-nova`, baseColor `neutral`, lucide). Componentes adicionados: `button`, `input`, `label`, `card`. **Atenção:** este shadcn novo (v4) usa `@base-ui/react` em vez do Radix direto; `Button` não suporta `asChild` — usar `buttonVariants()` na className.
- Removidos artefatos do scaffold que conflitavam com a raiz: `apps/web/pnpm-workspace.yaml`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`.
- `tsconfig.json` próprio (não estende a base — Next exige `module: esnext` + `moduleResolution: bundler` + `jsx: react-jsx`); strict-flags da base mantidos.
- `src/env.ts` valida `API_URL`/`NODE_ENV` via Zod.
- `pnpm-workspace.yaml`: liberados builds de `sharp` e `unrs-resolver`.

### 0.5.B — `/login` + server action + cookies httpOnly (commit `9e39cc8`)

- `lib/cookies.ts`: `setSessionCookies`, `clearSessionCookies`, `getAccessToken`, `getRefreshToken`. `nexa_access` (30min) e `nexa_refresh` (7d), httpOnly + sameSite=lax + secure em prod.
- `lib/api.ts`: `apiLogin` + classe `ApiError`.
- `/login` Server Component + `login-form` Client (`useActionState`) + server action.
- Server action: Zod schema espelha `LoginDto` da API. Erros específicos: `TENANT_REQUIRED` → instrução; 401 → "E-mail ou senha inválidos"; 400 → genérica; outros → genérica.
- `LoginState`/`initialLoginState` em `state.ts` separado — arquivos `'use server'` só podem exportar funções async (descoberto via erro 500).
- `/dashboard` placeholder lê `nexa_access`, redireciona se ausente.

### 0.5.C — Middleware + `/dashboard` real + logout (commit `f3e49d7`)

- `lib/cookie-names.ts` (edge-safe) split de `lib/cookies.ts` para o middleware importar sem trazer `next/headers`.
- `middleware.ts`: protege `/dashboard` e sub-rotas. Sem `nexa_refresh` → 307 → `/login?next=<path>`. Matcher exclui `_next/*` e estáticos.
- `apiServerFetch<T>` injeta Bearer access da cookie. Em 401, `redirect('/login')` apenas (RSC não pode modificar cookies — bug encontrado e corrigido durante a execução: `clearSessionCookies()` em RSC quebra com erro de framework).
- `apiMe()` tipado para `GET /me`.
- `/dashboard` real: header com tenant + nome + botão Sair; Card com 5 campos (`Usuário`, `Papel`, `Tenant`, `Plano`, `Último login`).
- `logoutAction`: best-effort `POST /auth/logout` na API + `clearSessionCookies` + redirect `/login`.

### 0.5.D — Refresh proativo no middleware (commit `63abe38`)

- `lib/jwt-exp.ts` (edge-safe): decode do payload do JWT via `atob` (sem verificar assinatura — uso restrito a checar `exp`).
- Middleware ganhou refresh proativo: se há `nexa_refresh` mas `nexa_access` ausente OU expirando em <30s, chama `POST /auth/refresh`, reescreve o header `Cookie` da request (para o RSC desta mesma cycle enxergar) + Set-Cookie na response. Falha → redirect `/login` com cookies limpos.
- Por que no middleware: Next 15+ proíbe modificar cookies fora de Server Actions/Route Handlers. Middleware é o único local viável para refresh transparente antes do RSC rodar.
- E2E validado em 3 cenários (access fresco passa direto / expirado refresca + rotaciona / refresh inválido limpa+redirect).

### 0.5.E — Polish + docs (commit pendente)

- Login respeita `?next=<path>` setado pelo middleware: page lê `searchParams`, valida (rejeita `//` para evitar open-redirect), passa como hidden input para o form; server action redireciona para o `next` saneado ou fallback `/dashboard`.
- `/dashboard/error.tsx` boundary client-component — captura falhas não-401 do `/me` (bug de API, network, 500) e mostra UI de retry com `reset()`.

### Pendências técnicas para fases futuras (registradas durante a 0.5)

- **Refresh com lock anti-race-condition** — duas requests paralelas com access expirado podem disparar 2 refreshes; o segundo pega refresh já rotacionado e dispara theft detection. Hoje é raro (server-rendered single page) mas com client navigation paralela pode acontecer. Pós-MVP.
- **Loading skeleton no `/dashboard`** durante o `await apiMe()` — Next streamea por default, mas `<Suspense>` com skeleton melhora UX. Adicionar quando o dashboard tiver mais conteúdo.
- **Toast/notificação de "sessão expirou"** quando o usuário é redirecionado para `/login` a partir de uma rota protegida — hoje é silencioso.
- **Validar comportamento em `secure: true`** (produção HTTPS) — sameSite=lax + secure pode comportar diferente em fluxo cross-site se algum dia houver iframe/SSO.
