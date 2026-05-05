# @crm-nexa/database

Schema Prisma, migrations e cliente compartilhado do CRM Nexa.

## Estrutura

```
packages/database/
├── prisma/
│   ├── schema.prisma     ← Schema único (verdade central)
│   └── migrations/       ← Migrations versionadas (criadas pela ferramenta)
├── src/
│   ├── index.ts          ← Re-exporta PrismaClient e tipos
│   └── seed.ts           ← Script de seed (criado na 0.3.C)
├── package.json
└── tsconfig.json
```

## Conexão e roles

O Prisma usa **dois usuários Postgres**, com finalidades diferentes:

| Variável env | Role no banco | Quando é usada | Sujeita a RLS |
|---|---|---|---|
| `DATABASE_ADMIN_URL` | `crm_admin` | Migrations, Studio, scripts admin | **Não** (BYPASSRLS) |
| `DATABASE_URL` | `crm_app` | Prisma Client em runtime (API/web) | **Sim** |

A separação é proposital: mesmo um bug de aplicação não consegue ler dados de outros tenants, porque o `crm_app` é filtrado por Row-Level Security no banco.

## Comandos principais

Todos roda a partir da raiz do monorepo:

| Comando | O que faz |
| --- | --- |
| `pnpm -F @crm-nexa/database db:format` | Reformata o `schema.prisma` |
| `pnpm -F @crm-nexa/database db:validate` | Valida sintaxe do schema (offline) |
| `pnpm -F @crm-nexa/database db:generate` | Gera o Prisma Client |
| `pnpm -F @crm-nexa/database db:migrate:create -- --name <nome>` | Gera SQL de migration sem aplicar |
| `pnpm -F @crm-nexa/database db:migrate:dev` | Aplica migrations em dev |
| `pnpm -F @crm-nexa/database db:migrate:deploy` | Aplica migrations em prod (idempotente) |
| `pnpm -F @crm-nexa/database db:migrate:status` | Mostra estado das migrations |
| `pnpm -F @crm-nexa/database db:studio` | Abre Prisma Studio (UI de inspeção) |
| `pnpm -F @crm-nexa/database db:seed` | Roda seed |

## RLS e migrations

Migrations contêm DDL gerado pelo Prisma + statements SQL custom para:
- Habilitar `ROW LEVEL SECURITY`
- Criar policies de isolamento por `tenant_id`
- Criar funções helper como `current_tenant_id()`

O fluxo padrão é:

1. Editar `schema.prisma`
2. Rodar `db:migrate:create -- --name <descricao>` para gerar SQL
3. Editar o `migration.sql` gerado e adicionar statements de RLS
4. Rodar `db:migrate:dev` para aplicar
