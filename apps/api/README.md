# @crm-nexa/api

API NestJS 11 do CRM Nexa — autenticação, multi-tenancy via RLS e endpoints REST.

## Rodar localmente

A partir da raiz do monorepo:

```bash
# 1. Garantir que .env (raiz) está preenchido — vide .env.example
pnpm install
pnpm -F @crm-nexa/database db:generate
pnpm -F @crm-nexa/api dev
```

Sobe em `http://localhost:3001` (porta de `API_PORT` no `.env`).

## Endpoints

| Método | Path | Auth | Descrição |
|---|---|---|---|
| `GET` | `/health` | Pública | Liveness + ping no Postgres |

> Endpoints de auth (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/me`) entram nas próximas sub-fases (0.4.B → 0.4.D).

## Estrutura

```
src/
  main.ts                 ← bootstrap (helmet, ValidationPipe global, Pino)
  app.module.ts
  config/configuration.ts ← typed config a partir de process.env
  common/
    logger/               ← nestjs-pino com redact de PII
    prisma/               ← PrismaService global (estende PrismaClient)
  modules/
    health/               ← GET /health
```
