# CRM Nexa

CRM multi-tenant + plataforma de mídias sociais para varejo, e-commerce e agências.

> **Status:** Em desenvolvimento — Fase 0 (Fundação).
> A documentação completa do projeto vive em pasta separada (Google Drive — consulte o owner).

## Stack

- **Backend:** NestJS + TypeScript
- **Frontend:** Next.js (App Router) + Tailwind + shadcn/ui
- **Banco:** PostgreSQL 17 + pgvector + Prisma
- **Cache / Filas:** Redis + BullMQ
- **Eventos:** RabbitMQ
- **Storage:** MinIO (S3-compatível)
- **Deploy:** Docker Swarm via Traefik

## Estrutura do monorepo

```
apps/
  api/          ← Backend NestJS (HTTP + workers)
  web/          ← Frontend Next.js
packages/
  database/     ← Prisma schema, migrations e seeds
  shared/       ← Tipos e utilitários compartilhados
docker/         ← Dockerfiles e stack files
.github/
  workflows/    ← Pipelines de CI/CD
```

## Pré-requisitos

- Node.js 22 LTS (use `.nvmrc`)
- pnpm ≥ 9
- Docker Desktop
- Acesso aos serviços do Swarm: Postgres, Redis, MinIO

## Setup local

```bash
git clone git@github.com:abnermeirelles/crm-nexa.git
cd crm-nexa
pnpm install
cp .env.example .env
# Preencha .env com credenciais reais — pergunte ao owner
pnpm dev
```

## Comandos principais

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Sobe API e Web em modo watch |
| `pnpm build` | Build de produção de todos os pacotes |
| `pnpm lint` | Lint de todos os pacotes |
| `pnpm test` | Roda testes |
| `pnpm typecheck` | Verifica tipos sem emitir |
| `pnpm format` | Formata todo o projeto com Prettier |

## Convenções

- **Branches:** `main` (deployável), `feat/<assunto>`, `fix/<bug>`, `chore/<tarefa>`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat(api): ...`, `fix(web): ...`
- **PRs:** Abrir PR mesmo solo dev. CI roda no PR. Merge só com check verde.

## Licença

Proprietário. Todos os direitos reservados.
