# 04 — Fase 0.4: API NestJS + Auth + Tenancy

> **Duração estimada:** 3 a 4 dias (solo dev)
> **Pré-requisitos:** Fase 0.3 concluída (banco multi-tenant funcionando com RLS).
> **Última atualização:** 2026-05-06
> **Status:** Pendente — não iniciada

---

## 1. Objetivo

No fim da Fase 0.4, o sistema deve ter:

- ✅ `apps/api` rodando com **NestJS 11** (Node 22+)
- ✅ Endpoint `GET /health` (sem auth)
- ✅ Endpoint `POST /auth/login` — recebe e-mail+senha, devolve **access JWT** (~15min) + **refresh token** (~7 dias)
- ✅ Endpoint `POST /auth/refresh` — recebe refresh, devolve novo par (rotação de refresh)
- ✅ Endpoint `POST /auth/logout` — revoga sessão atual
- ✅ Endpoint `GET /me` — autenticado, retorna user + tenant
- ✅ **Tenancy automática**: cada request autenticada injeta `tenant_id` na sessão Postgres antes das queries (via Prisma extension + nestjs-cls)
- ✅ `packages/shared` criado com utilitário `argon2` (hash, verify) — reutilizável por API e por seeds
- ✅ Seed em TypeScript que cria 1 tenant `dev` e 1 owner `owner@nexa.dev` com senha hasheada com argon2

**Critério de "feito":** consegue rodar uma sequência via `curl` ou Insomnia/Bruno:

```bash
# 1. Health
curl http://localhost:3001/health
# 200 OK

# 2. Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@nexa.dev", "password": "dev123!"}'
# 200 — retorna { accessToken, refreshToken, user, tenant }

# 3. Me (com o accessToken do login)
curl http://localhost:3001/me \
  -H "Authorization: Bearer <accessToken>"
# 200 — retorna { id, email, name, role, tenant: {...} }

# 4. Try /me sem token
curl http://localhost:3001/me
# 401 Unauthorized
```

---

## 2. Sub-fases

A Fase 0.4 é dividida em 4 sub-sub-fases sequenciais.

### Sub-fase 0.4.A — Bootstrap `apps/api` + `packages/shared` (1 dia)

**Saída:** NestJS rodando em modo watch, conectado ao banco, expondo `/health`.

- Criar `apps/api` com NestJS CLI
- Criar `packages/shared` (auth utils + tipos compartilhados)
- Adicionar dependências: NestJS, Pino, class-validator, @node-rs/argon2, nestjs-cls, etc.
- Configurar TypeScript path aliases entre packages
- Importar `PrismaClient` de `@crm-nexa/database`
- Criar `PrismaService` (provider NestJS)
- Endpoint `GET /health` que faz `SELECT 1` no banco
- Logs estruturados com Pino
- Configuração via `@nestjs/config` lendo `.env` raiz

### Sub-fase 0.4.B — PrismaService + Tenancy middleware (1 dia)

**Saída:** queries fazem `SET LOCAL app.current_tenant_id` automaticamente.

- `nestjs-cls` configurado (Continuation-Local Storage)
- Middleware/Guard que extrai claims do JWT e popula CLS com `{userId, tenantId, role}`
- `PrismaService` usa **Prisma Client extension** que envolve cada query em transação com `SET LOCAL app.current_tenant_id` da CLS
- Decorators `@CurrentUser()` e `@CurrentTenant()`
- Endpoint de teste temporário que prova: query com tenant A só vê tenant A

### Sub-fase 0.4.C — Auth module (1.5 dias)

**Saída:** login, refresh, logout, guard funcionando.

- Módulo `Auth` (controller + service + DTOs)
- DTO `LoginDto` validado com class-validator
- `AuthService.login()` — busca user (case-insensitive via Citext), valida senha com argon2, gera par de tokens
- Geração de **access JWT** (HS256, TTL 15min) com claims `{sub, tenantId, role}`
- Geração de **refresh token** (32 bytes random, hex) — hash em argon2 e salvo em `user_sessions`
- `AuthService.refresh()` — valida refresh, **rotação obrigatória** (cria novo par e revoga o anterior)
- `AuthService.logout()` — revoga sessão atual
- **Detecção de roubo:** se um refresh já revogado for usado, **revoga toda a cadeia de sessions** do user e força logout global
- `JwtAuthGuard` aplicável globalmente ou por rota
- Decorator `@Public()` para rotas que dispensam auth
- Logs sem expor senhas/tokens

### Sub-fase 0.4.D — Endpoints finais + seed em TypeScript (0.5 dia)

**Saída:** seed funcional + `/me` autenticado.

- Endpoint `GET /me` — usa `@CurrentUser()` e busca tenant
- Script `packages/database/src/seed.ts` em TypeScript
  - Importa `PrismaClient` (com `DATABASE_ADMIN_URL` para bypass RLS no seed)
  - Importa `hashPassword` de `@crm-nexa/shared`
  - Upsert tenant `dev` + user `owner@nexa.dev` com hash de `dev123!`
  - Configurado em `package.json` via `prisma.seed`
- `pnpm -F @crm-nexa/database db:seed` funciona
- Teste manual da sequência completa (login → me) descrita no §1
- Atualiza `apps/api/README.md` com como rodar localmente

---

## 3. Stack adicional para 0.4

| Pacote | Função |
|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | Framework base |
| `@nestjs/config` | Config tipada via `.env` |
| `@nestjs/jwt` | JWT sign/verify |
| `@nestjs/passport` + `passport-jwt` | Strategy JWT idiomática |
| `@node-rs/argon2` | Hash e verify de senhas (argon2id, sem build nativo via node-gyp) |
| `class-validator` + `class-transformer` | Validação de DTOs |
| `nestjs-cls` | Continuation-Local Storage para tenant context |
| `nestjs-pino` + `pino` + `pino-pretty` | Logs estruturados |
| `helmet` | Headers de segurança |

---

## 4. Decisões importantes da fase

### 4.1 Tokens

- **Access JWT:** HS256 (chave simétrica). Curto (15min). Stateless (não consulta o banco).
- **Refresh token:** opaco, 32 bytes random hex. Hash argon2 em `user_sessions.refresh_token_hash`. Longo (7 dias). Permite revogação por sessão.
- **Por que misto:** stateless para o request comum (rápido), revogável para sessões longas (segurança).

### 4.2 Como propagar `tenant_id` para o banco

**Decisão:** `nestjs-cls` + Prisma Client extension.

- Quando o `JwtAuthGuard` valida o token, popula CLS com `{userId, tenantId, role}`.
- O `PrismaService` registra uma extensão Prisma que, antes de cada query, envolve em transação curta com `SET LOCAL app.current_tenant_id = <da CLS>`.
- **Garantia:** é impossível esquecer de setar — fica no nível da PrismaService. Toda query que passa pelo Prisma vai estar tenant-scoped.

### 4.3 Rotação de refresh token

Cada chamada de `POST /auth/refresh`:
1. Recebe refresh token.
2. Busca em `user_sessions` por hash bate.
3. Se já revogado → **suspeita de roubo** — revoga TODAS as sessões do user, retorna 401.
4. Se válido → cria novo par (access + refresh), revoga o atual, retorna novo par.

Isso é a abordagem padrão de **rotação detectiva** de refresh — protege contra reuso após roubo.

### 4.4 Argon2 em vez de bcrypt

- argon2id é o vencedor da Password Hashing Competition (2015).
- Resistente a GPU/ASIC attacks de forma melhor que bcrypt.
- `@node-rs/argon2` usa binding Rust (sem dependência de Python/node-gyp), funciona em qualquer Docker.

---

## 5. Estrutura de diretórios após 0.4

```
apps/
  api/
    src/
      main.ts
      app.module.ts
      config/
        configuration.ts          ← typed config from env
      common/
        prisma/
          prisma.service.ts        ← wraps PrismaClient + tenant extension
          prisma.module.ts
        cls/
          cls.module.ts
        logger/
          logger.module.ts
        decorators/
          public.decorator.ts
          current-user.decorator.ts
          current-tenant.decorator.ts
        guards/
          jwt-auth.guard.ts
      modules/
        auth/
          auth.module.ts
          auth.controller.ts
          auth.service.ts
          dto/
            login.dto.ts
          strategies/
            jwt.strategy.ts
        health/
          health.controller.ts
        users/
          users.module.ts
          users.controller.ts       (apenas /me)
          users.service.ts
    nest-cli.json
    package.json
    tsconfig.json
packages/
  shared/
    src/
      auth/
        argon2.ts                  ← hashPassword, verifyPassword
      tokens/
        token.ts                   ← geração de refresh tokens random
      index.ts
    package.json
    tsconfig.json
  database/
    src/
      index.ts
      seed.ts                      ← novo
    prisma/
      schema.prisma
      migrations/...
    package.json
```

---

## 6. Convenções de código

- **Toda requisição passa por:** middleware Pino (logs) → `JwtAuthGuard` (a menos que `@Public()`) → CLS preenchida → controller → service → PrismaService (com tenant via CLS).
- **Validação:** sempre via `class-validator` em DTOs. `ValidationPipe` global em `main.ts`.
- **Erros:** lançar `HttpException` ou específicos (`UnauthorizedException`, `BadRequestException`). `ExceptionFilter` global formata resposta.
- **Logs:** sem PII (e-mail, telefone) em logs de produção. Senhas/tokens NUNCA logados.

---

## 7. Riscos e mitigações da fase

| Risco | Mitigação |
|---|---|
| Esquecer de aplicar guard em rota sensível | `JwtAuthGuard` aplicado **globalmente**; rotas públicas marcadas com `@Public()` explícito. Erro de "esqueci" vira "deixei público sem querer" — mais visível. |
| CLS não propagar em código async/parallel | `nestjs-cls` cobre o fluxo padrão; testar explicitamente no endpoint de teste da 0.4.B. |
| Refresh token reusado por roubo | Rotação detectiva — vide §4.3. |
| Logs vazando senha | Pino redact configurado para `password`, `passwordHash`, `refreshToken`, `accessToken`. |
| JWT secret fraco | Gerar 64 hex bytes via `openssl rand -hex 64`, manter no `.env`, **nunca commitar**. |

---

## 8. Definição de "Fase 0.4 concluída"

- [ ] `pnpm -F @crm-nexa/api dev` sobe a API em watch sem erro
- [ ] `curl http://localhost:3001/health` retorna 200 com `{ status: "ok", db: "ok" }`
- [ ] `pnpm -F @crm-nexa/database db:seed` cria tenant + owner sem erro
- [ ] Login com `owner@nexa.dev` / `dev123!` retorna 200 + tokens
- [ ] `GET /me` com access token retorna user + tenant corretos
- [ ] `GET /me` sem token ou com token inválido retorna 401
- [ ] `POST /auth/refresh` rotaciona corretamente e revoga o anterior
- [ ] Tentar usar refresh já revogado retorna 401 + revoga toda cadeia (sessões deletadas/revogadas)
- [ ] Endpoint de teste do tenant context retorna apenas dados do tenant logado
- [ ] PR aberto, mergeado, branch limpa
- [ ] Documentação atualizada (`docs/03` marca 0.4 ✅, este doc atualiza status)

---

## 9. O que NÃO entra na Fase 0.4

Para evitar escopo inflado:

- MFA (TOTP) — vai antes do primeiro cliente pago
- Recuperação de senha por e-mail — só quando tivermos SendGrid configurado
- Convite de usuários para tenant — Fase 1 ou 2
- Permissões granulares por recurso (RBAC fino) — Fase 1
- Refresh token rotation com detecção avançada (e-mail de alerta) — pós-MVP
- Rate limiting em `/auth/login` — adicionar antes do beta (importante, mas não bloqueador)
- Sessão concurrent limit — pós-MVP
