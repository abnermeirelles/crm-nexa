# 03 — Fase 0: Fundação

> **Duração estimada:** 2 a 2,5 semanas (solo dev)
> **Objetivo:** Sair do zero com esqueleto deployável, banco multi-tenant funcionando com RLS, autenticação funcionando, e pipeline de CI/CD ativo.
> **Última atualização:** 2026-05-06
> **Status:** Em execução — 0.1, 0.2, 0.3 concluídas (PR #1 mergeado). Próxima: 0.4.

---

## 1. Objetivo da Fase

No fim da Fase 0, **antes de qualquer feature de negócio**, o sistema deve ter:

- ✅ Repositório Git no GitHub com estrutura de monorepo
- ✅ Ambiente de dev no Mac do owner conectado ao Docker Swarm via VPN
- ✅ Banco Postgres com schema inicial (`tenants`, `users`, `user_sessions`, `audit_log`) + Row-Level Security ativa
- ✅ API NestJS rodando com:
  - Login (e-mail + senha + JWT)
  - Middleware que injeta `tenant_id` na sessão Postgres
  - Endpoint `/health`
- ✅ Web Next.js rodando com:
  - Tela de login funcional
  - Layout do dashboard (sidebar + header) sem features ainda
  - Logout
- ✅ CI no GitHub Actions: lint + typecheck + tests rodando em cada push
- ✅ CD: imagem Docker buildada e publicada no GHCR; deploy manual no Swarm via Portainer ou comando
- ✅ Primeiro deploy de staging no Swarm respondendo HTTPS via Traefik

**Critério de "feito":** o owner consegue abrir `https://staging.crmnexa.com.br`, fazer login com um usuário seed, e ver um dashboard vazio. Toda essa cadeia (Mac → git → CI → registry → Swarm → Traefik → browser) funciona ponta a ponta.

---

## 2. Sub-fases

A Fase 0 é dividida em 6 sub-fases sequenciais. Cada uma fecha com um marco testável.

### Sub-fase 0.1 — Setup ambiental (1–2 dias)

**Saída:** Mac do owner pronto para desenvolver.

- Instalar pré-requisitos no Mac: Node 20, pnpm, Git, Docker Desktop, GitHub CLI (`gh`), VS Code (já tem)
- Criar conta GitHub (se ainda não tiver para o projeto)
- Configurar SSH key no GitHub
- Definir local do código: `~/Projects/crm-nexa/`
- Instalar Tailscale no Mac e em um nó do Swarm
- Validar conexão: do Mac, fazer `ping`/`telnet` no Postgres do Swarm via IP Tailscale
- Validar conexão Redis e MinIO

### Sub-fase 0.2 — Repositório e monorepo (1 dia)

**Saída:** repositório vazio mas estruturado, primeiro commit.

- Criar repo `crm-nexa` no GitHub (privado)
- Inicializar localmente em `~/Projects/crm-nexa`
- Criar estrutura monorepo (pnpm workspaces + Turborepo):
  ```
  crm-nexa/
  ├── apps/
  │   ├── api/           ← NestJS (placeholder)
  │   └── web/           ← Next.js (placeholder)
  ├── packages/
  │   ├── database/      ← Prisma schema
  │   └── shared/        ← tipos e utils
  ├── .github/workflows/
  ├── docker/            ← Dockerfiles
  ├── package.json       ← workspaces
  ├── pnpm-workspace.yaml
  ├── turbo.json
  ├── tsconfig.base.json
  ├── .gitignore
  ├── .editorconfig
  ├── .env.example
  ├── README.md
  └── LICENSE
  ```
- Primeiro commit: estrutura vazia
- Push para GitHub

### Sub-fase 0.3 — Banco + Prisma + Multi-tenant (3–4 dias)

**Saída:** banco do CRM separado, com tabelas iniciais e RLS funcionando.

- Criar banco dedicado no Postgres do Swarm: `crm_nexa_dev`
- Criar role `crm_app` (user de aplicação, sem `BYPASSRLS`)
- Criar role `crm_admin` (com `BYPASSRLS`, para migrations e jobs administrativos)
- Inicializar Prisma em `packages/database`
- Schema inicial: `Tenant`, `User`, `UserSession`, `AuditLog`
- Migration inicial inclui:
  - Tabelas
  - Extensões: `uuid-ossp`, `pg_trgm`, `citext`, `vector`
  - Função para gerar UUIDv7 (ou fallback para UUIDv4 se não disponível)
  - RLS ativo + policies em todas as tabelas com `tenant_id`
  - Triggers de `updated_at`
- Seed: 1 tenant `dev`, 1 usuário `owner@nexa.dev` com senha `dev123` (só ambiente dev)
- Documentar comando para resetar/reaplicar seed

### Sub-fase 0.4 — API NestJS + Auth (3–4 dias)

**Saída:** `POST /auth/login`, `POST /auth/refresh`, `GET /me` funcionando.

- Inicializar NestJS em `apps/api`
- Configurar Prisma client compartilhado de `packages/database`
- Módulo `Auth`:
  - Login com e-mail + senha (argon2id)
  - JWT (access ~15 min) + refresh token rotativo
  - Guard `@Authenticated()` e decorator `@CurrentUser()`
- Módulo `Tenancy`:
  - Middleware extrai `tenant_id` do JWT
  - Wrapper que abre transação Postgres com `SET LOCAL app.current_tenant_id`
  - Decorator `@CurrentTenant()`
- Endpoint `/health` (sem auth)
- Endpoint `/me` (autenticado)
- Configuração via `@nestjs/config` lendo `.env`
- Logs estruturados com Pino
- Validação de DTOs com class-validator
- Tratamento de erros centralizado

### Sub-fase 0.5 — Web Next.js + Login (2–3 dias)

**Saída:** UI de login + dashboard vazio.

- Inicializar Next.js em `apps/web` (App Router, TypeScript)
- Tailwind + shadcn/ui setup
- Auth.js (NextAuth) com adapter customizado que chama `apps/api`
- Páginas:
  - `/login` — formulário, valida com a API, salva session
  - `/` — protegida, redireciona para `/login` se não autenticado
  - `/dashboard` — layout com sidebar (placeholder de menus) + header com nome do tenant + dropdown do usuário
- Componente de logout
- Tema claro/escuro (shadcn já entrega)
- Variável `NEXT_PUBLIC_API_URL` para apontar para a API

### Sub-fase 0.6 — CI/CD + Primeiro deploy (2–3 dias)

**Saída:** push em `main` → staging atualiza automaticamente.

- GitHub Actions:
  - Job `lint`: ESLint + Prettier check
  - Job `typecheck`: `tsc --noEmit` em todos os pacotes
  - Job `test`: unit tests (Vitest ou Jest) — começamos com poucos
  - Job `build`: Turborepo build
- Dockerfiles multi-stage para `apps/api` e `apps/web`
- Push de imagens para GHCR (`ghcr.io/<owner>/crm-nexa-api`, `crm-nexa-web`)
- Stack file `docker-stack.staging.yml` com serviços: api, web, scheduler
- Webhook do GitHub Actions chama Portainer / executa `docker stack deploy` via SSH
- Migrations rodam em job separado **antes** do deploy (`prisma migrate deploy`)
- DNS: subdomínio `staging.crmnexa.com.br` apontando para o servidor
- Traefik com rótulos certos para TLS automático via Let's Encrypt

---

## 3. Decisões a tomar antes do código

| Decisão | Opções | Padrão sugerido |
|---|---|---|
| Domínio principal | `crmnexa.com.br`, `<outro>.com.br` | Dependente do owner |
| Subdomínio de staging | `staging.<dominio>` | `staging.crmnexa.com.br` |
| Subdomínio do tenant | `<slug>.<dominio>` | `<slug>.crmnexa.com.br` |
| Nome do repositório GitHub | `crm-nexa`, `nexa-crm`, etc. | `crm-nexa` |
| Visibilidade do repo | privado / público | **Privado** (código comercial) |
| Registry de imagens | GHCR (gratuito), Docker Hub, próprio | **GHCR** |
| Banco dev separado do banco prod? | Sim / Não | **Sim** — `crm_nexa_dev` no Postgres do Swarm para dev/staging; produção depois |

---

## 4. Convenções para começar

### 4.1 Branches Git

- `main` — sempre deployável, protegida
- `feat/<assunto>` — nova feature ou bloco de trabalho
- `fix/<bug>` — correção
- `chore/<tarefa>` — refactor, deps, infra

Cada sub-fase abre uma branch própria e fecha com Pull Request mesmo sendo solo dev (boa prática + histórico legível).

### 4.2 Padrão de commit

Usar **Conventional Commits**:
- `feat(api): adiciona endpoint /me`
- `fix(web): corrige redirect do login`
- `chore(deps): atualiza prisma para 5.10`
- `docs: atualiza ADR-003`

### 4.3 PR antes de merge

Mesmo solo, abrir PR de cada branch para `main`. Vantagens:
- CI roda no PR antes do merge — pega problema cedo
- Histórico fica organizado
- Owner consegue revisar a si mesmo com olhar fresco

### 4.4 Tamanho de commit/PR

- Commits pequenos e atômicos (uma mudança lógica = um commit)
- PR fecha uma sub-fase ou sub-tarefa, raramente dois assuntos juntos

---

## 5. O que NÃO entra na Fase 0

Para evitar que a Fase 0 vire mês inteiro, **explicitamente fora**:

- CRUD de contatos (vai pra Fase 1)
- Tela de configurações de tenant
- Convite de outros usuários para o tenant
- Recuperação de senha (deixa pro depois — só admin tem login no MVP inicial)
- E-mail transacional (não tem o que enviar ainda)
- MFA (vai depois, antes de 1º cliente pago)
- Internacionalização (só pt-BR)
- Tema customizável por tenant (cores/logo) — só Fase 1+
- Métricas/Grafana/observabilidade detalhada — só logs básicos

---

## 6. Riscos e mitigações da Fase 0

| Risco | Mitigação |
|---|---|
| Configuração de RLS quebrar em algum caso edge | Escrever teste E2E desde o dia 1 que tenta vazar dado entre tenants — falha = bug crítico |
| Deploy falhar em produção mas funcionar em dev | Subir staging idêntico em produção (mesmo Swarm) na 0.6 |
| Migration zero-downtime mais complexa que parece | Pesquisar e documentar padrão antes de aplicar pela primeira vez (criar `docs/05-migrations.md` quando chegar lá) |
| Tailscale não chegar nos serviços do Swarm | Validar conexão na 0.1 antes de qualquer outra coisa. Plano B: SSH tunnel. |
| Solo dev distrair-se entre subfases | PR a cada sub-fase como checkpoint. Não pular nem agrupar. |

---

## 7. Definição de "Fase 0 concluída"

Checklist final, todos obrigatórios:

- [ ] `https://staging.crmnexa.com.br/login` carrega
- [ ] Login com seed funciona
- [ ] `/me` retorna user + tenant
- [ ] Logout funciona
- [ ] Tentar acessar dado de outro tenant via API (com tenant_id forjado) **falha**
- [ ] Push em `main` dispara pipeline e deploy
- [ ] Migration aplicada em staging sem perda de dados (teste com dado seed antes/depois)
- [ ] Restore do dump do Postgres testado em ambiente novo
- [ ] README do repositório explica como rodar localmente (assumindo um novo dev)
- [ ] Diagrama atual da topologia atualizado em `docs/01-arquitetura.md` se mudou algo

---

## 8. Histórico de execução

> Esta seção é viva — atualizar conforme a fase progride.

### 0.1 — Setup ambiental ✅ concluída em 2026-05-05

- Pré-requisitos no Mac instalados (Node 25, pnpm 11, libpq, redis-cli, Docker, gh CLI)
- SSH key configurada via `gh auth login --git-protocol ssh`
- Acesso ao Swarm: serviços já publicamente acessíveis em `cloud.nexasource.com.br` (sem necessidade de Tailscale por enquanto)
- Pasta do código: `~/Projetos/crm-nexa` (fora do GDrive)

### 0.2 — Repositório e monorepo ✅ concluída em 2026-05-05

- Repo `abnermeirelles/crm-nexa` criado privado no GitHub
- Estrutura monorepo (pnpm workspaces + Turborepo) montada
- Config raiz: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.npmrc`, `.prettierrc.json`, `.env.example`, `.vscode/`
- Commit: `chore: bootstrap monorepo (Sub-fase 0.2)`

### 0.3 — Banco + Prisma + Multi-tenant com RLS ✅ concluída em 2026-05-06

- Banco `crm_nexa_dev` criado no Postgres 17 do Swarm
- Roles separadas: `crm_app` (sem BYPASSRLS, runtime) e `crm_admin` (com BYPASSRLS, CREATEDB, CREATE on database; usado em migrations e admin)
- Extensões: `uuid-ossp`, `pg_trgm`, `citext` (vector adiada para Fase 10)
- Package `@crm-nexa/database` com Prisma 6
- Migration `20260506222333_init_tenancy` aplicada — cria 4 tabelas (`tenants`, `users`, `user_sessions`, `audit_log`) + função `current_tenant_id()` + RLS forçada + 4 policies + triggers de `updated_at` e `prevent_audit_update`
- Validado via 5 testes manuais de isolamento — RLS bloqueia leitura, INSERT e UPDATE cross-tenant via `crm_app`
- PR #1 squash mergeado na main

### 0.4 — API NestJS + Auth ✅ concluída em 2026-05-07

- `apps/api` (NestJS 11 + Express + Pino) e `packages/shared` (argon2 + token utils) criados
- Multi-tenancy automática via `nestjs-cls` + extensão Prisma (`SET LOCAL app.current_tenant_id`); RLS isola por JWT
- Auth completa: `/auth/login`, `/auth/refresh` (rotação detectiva), `/auth/logout`, `/me`, `/health`
- `JwtAuthGuard` global; `@Public()` para rotas anônimas
- Seed em TS (`packages/database/src/seed.ts`) cria `dev` + `owner@nexa.dev` / `dev123!`
- E2E manual: critérios §1 do plano todos verdes
- Detalhes e histórico em [`docs/04-fase-0-4-api-auth.md`](04-fase-0-4-api-auth.md) §10

### 0.5 — Web Next.js + Login ✅ concluída em 2026-05-07

- `apps/web` (Next.js 16 + React 19 + Tailwind v4 + shadcn estilo `base-nova`) integrado ao monorepo
- Sessão server-side via cookies httpOnly (`nexa_access`, `nexa_refresh`) — cliente nunca toca tokens
- `/login` com Server Action + Zod, mensagens de erro humanas, defesa contra open-redirect via `?next`
- `/dashboard` autenticado renderiza `/me` com user + tenant + plano; logout via Server Action
- Middleware refresca tokens proativamente quando access está expirando (<30s) — RSC sempre vê access fresco
- Detalhes e histórico em [`docs/05-fase-0-5-web-login.md`](05-fase-0-5-web-login.md) §10
### 0.6 — CI/CD + Primeiro deploy ✅ concluída em 2026-05-12

- Dockerfiles multi-stage para `apps/api` (Debian + Prisma engine) e `apps/web` (Next standalone)
- `deploy/stack-staging.yml` Compose v3 para Swarm com Traefik + secrets externos, deployado via Portainer Repository mode
- GitHub Actions: `pr-validate` + `staging-deploy` (validate → build-push → migrate → webhook) — 100% automático em push para `main`
- Convenção `*_FILE` na API consome Docker Swarm secrets de `/run/secrets/`, tolerando formatos comuns de copy-paste
- Staging rodando em `https://crm-dev.nexasource.com.br` (web) e `https://api.crm-dev.nexasource.com.br` (api), ambos com TLS Let's Encrypt
- Detalhes e bugs encontrados durante bootstrap real em [`docs/06`](06-fase-0-6-cicd-deploy.md) §10

---

## 9. Pendências técnicas registradas durante a execução

Itens que apareceram durante 0.1-0.3 e ficaram para depois:

- **Restringir Postgres e Redis por IP allowlist no pfSense** ou colocar atrás de Tailscale antes do primeiro cliente pago. Risco de segurança documentado em `docs/01-arquitetura.md` §13.
- **`crm_admin` em produção** não deve ter `CREATEDB` nem `CREATE ON DATABASE`. Esses privilégios foram concedidos só em dev por causa do shadow database do Prisma e de `CREATE EXTENSION`. Em prod usaremos `prisma migrate deploy` que dispensa shadow DB.
- **`vector` (pgvector)** não está sendo gerenciado pelo Prisma — adicionar via migration manual quando começar Fase 10 (IA opcional).
- **Backup off-site** (DigitalOcean Spaces) ainda não configurado — agendar antes do beta.
