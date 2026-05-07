# CLAUDE.md — Contexto para o Claude Code

Este arquivo é lido automaticamente toda vez que o Claude Code abre o projeto. Mantém o assistente alinhado sem depender de memória de conversas anteriores.

## Sobre o projeto

CRM Nexa — SaaS multi-tenant comercial de CRM + mídias sociais, voltado a varejo (drogarias), e-commerce e agências de marketing. Solo dev: Abner Meirelles (pt-BR).

**Diferencial:** precificação acessível vs. RD Station, HubSpot, ActiveCampaign, Mautic — viabilizada por integrações com serviços externos mais baratos.

**Escala alvo no ano 1:** 5 tenants ativos, até 1M contatos por tenant.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 11 + TypeScript (Node 22 LTS alvo) |
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui |
| Banco | PostgreSQL 17 + pgvector + Prisma 6 |
| Cache/Filas | Redis + BullMQ |
| Eventos | RabbitMQ |
| Storage | MinIO (S3-compatível) — already em produção |
| Deploy | Docker Swarm via Traefik |
| Motor de automação | **Engine próprio** em NestJS (NÃO n8n — ADR-003 revisado) |

## Estrutura do monorepo

```
apps/
  api/          ← NestJS (criado na Fase 0.4)
  web/          ← Next.js + Tailwind + shadcn (criado na Fase 0.5)
packages/
  database/     ← Prisma schema + migrations + seed (criado na Fase 0.3)
  shared/       ← Auth utils (argon2, refresh tokens) — criado na Fase 0.4
docs/           ← Documentação canônica (versionada em git)
```

## Documentação canônica

A documentação **vive neste repo**, em `docs/`. Toda mudança de doc passa por commit/PR.

- [`docs/01-arquitetura.md`](docs/01-arquitetura.md) — visão de arquitetura completa, ADRs, riscos
- [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) — modelo de dados (todas as fases)
- [`docs/03-fase-0-fundacao.md`](docs/03-fase-0-fundacao.md) — plano da Fase 0 + histórico de execução
- [`docs/04-fase-0-4-api-auth.md`](docs/04-fase-0-4-api-auth.md) — plano da próxima sub-fase

> Existe um backup histórico da pasta de docs em `~/Library/CloudStorage/GoogleDrive.../Meu Drive/Documentos/Projetos/CRM Nexa Source/docs/` — **NÃO atualizar lá**. Versão canônica é o repo.

## Estado da implementação (atualizar conforme progride)

| Fase | Status |
|---|---|
| 0.1 — Setup ambiental | ✅ Concluída |
| 0.2 — Repo + monorepo | ✅ Concluída |
| 0.3 — Banco + Prisma + Multi-tenant RLS | ✅ Concluída (PR #1) |
| 0.4 — API NestJS + Auth + Tenancy | ✅ Concluída |
| 0.5 — Web Next.js + Login | ✅ Concluída |
| 0.6 — CI/CD + primeiro deploy | ⏳ **Próxima** |

## Endpoints e paths importantes

**Postgres dev:** `cloud.nexasource.com.br:52430` / banco `crm_nexa_dev` / roles `crm_app` (runtime, sujeita a RLS) e `crm_admin` (migrations, BYPASSRLS).

**Redis:** `cloud.nexasource.com.br:52479`
**MinIO:** `s3.nexasource.com.br`
**Domínio do staging:** `crm-dev.nexasource.com.br`

⚠️ Postgres e Redis estão **publicamente acessíveis** durante dev — **DEVE ser restringido por IP ou movido para Tailscale antes do primeiro cliente pago**. Risco documentado em [`docs/01-arquitetura.md`](docs/01-arquitetura.md) §13.

## Convenções

- **Linguagem de comunicação:** Português (pt-BR) salvo pedido explícito em outra língua.
- **Branches Git:** `main` (deployável), `feat/<assunto>`, `fix/<bug>`, `chore/<tarefa>`.
- **Commits:** Conventional Commits (`feat(api): ...`, `fix(web): ...`, `docs: ...`).
- **PR antes de merge:** mesmo solo dev. Squash merge na main.
- **Identificadores:** UUIDv7 como PK (`@default(uuid(7))`). camelCase em código TS, snake_case em SQL/banco — Prisma traduz via `@map`/`@@map`.
- **Tabelas multi-tenant:** sempre têm `tenantId` indexado + RLS forçada + policy `USING tenant_id = current_tenant_id() WITH CHECK ...`.
- **Comentários em código:** padrão é não comentar. Só comentar quando o "porquê" é não-óbvio (workaround, invariante sutil, decisão arquitetural específica).

## Como rodar localmente

```bash
pnpm install                                # roda prepare da @crm-nexa/shared (build)
cp .env.example .env                        # preencha com credenciais reais
pnpm -F @crm-nexa/database db:generate      # gera o Prisma Client
pnpm -F @crm-nexa/database db:migrate:deploy # aplica migrations (uma vez)
pnpm -F @crm-nexa/database db:seed          # cria tenant 'dev' + owner@nexa.dev/dev123!
pnpm -F @crm-nexa/api dev                   # API em http://localhost:3001 (terminal 1)
pnpm -F @crm-nexa/web dev                   # Web em http://localhost:3000 (terminal 2)
```

API: `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`.
Web: `/` (landing), `/login`, `/dashboard` (protegido por middleware).

## Restrições importantes

- **LGPD:** SaaS comercial vendendo a varejo guarda dados pessoais sensíveis. **Não pode receber primeiro cliente pago sem checklist de LGPD cumprido** (vide `docs/01-arquitetura.md` §7). Consultoria jurídica obrigatória.
- **Solo dev (bus factor 1):** documentação, backups testados e plano de continuidade são obrigatórios.
- **Backup off-site** (DigitalOcean Spaces) ainda não configurado — agendar antes do beta.
