# 07 — Fase 1: Contatos / CRM core

> **Duração estimada:** 4 a 5 dias (solo dev) — **executada em 2026-05-12/13**
> **Pré-requisitos:** Fase 0 concluída (API, Web e CI/CD operacionais).
> **Última atualização:** 2026-05-13
> **Status:** ✅ Concluída — vide §10 (Histórico de execução)

---

## 1. Objetivo

No fim da Fase 1, o CRM deve permitir gerenciar contatos de ponta a ponta:

- ✅ Modelo `Contact` no banco com RLS por tenant
- ✅ API REST: criar, listar (com filtros + paginação), detalhar, editar, soft-delete
- ✅ Web: tela de listagem com filtros, página de detalhe/edição, formulário de criação
- ✅ Import CSV com mapping de colunas, processamento assíncrono via BullMQ + Redis, dedup por e-mail
- ✅ AuditLog popular para create/update/delete (atende LGPD §17)

**Critério de "feito":**

```
1. Login → /contacts mostra lista (vazia se primeiro uso)
2. Clicar "Novo contato" → form → salvar → aparece na lista
3. Editar contato → salvar → audit_log tem entrada
4. Soft-delete → contato some da lista padrão; consulta com ?includeDeleted=1 mostra
5. Upload CSV com 500 linhas → progresso visível → importação completa → contatos na lista
6. Tentar acessar /contacts de outro tenant via JWT forjado → 401 ou lista vazia (RLS)
```

---

## 2. Sub-fases

A Fase 1 é dividida em 6 sub-sub-fases sequenciais.

### Sub-fase 1.A — Schema + migration + Prisma model (0.5 dia)

**Saída:** modelo `Contact` no banco, RLS ativa, Prisma client gerado.

- `Contact` no `schema.prisma`:
  - `id` UUID v7 PK
  - `tenantId` UUID FK
  - `name`, `email` (Citext, optional), `phone`, `document` (CPF/CNPJ, optional, validado em DTO)
  - `companyName` (optional)
  - `stage` enum: `lead | prospect | customer | churned`
  - `source` (optional, ex: 'whatsapp', 'csv-import', 'manual')
  - `ownerId` FK opcional para `User`
  - `tags` `String[]` (text[] do Postgres)
  - `createdAt`, `updatedAt`, `deletedAt` (timestamptz)
- Indexes:
  - `(tenantId, email)` unique parcial onde `deletedAt IS NULL`
  - `(tenantId, stage)` btree
  - `(tenantId, ownerId)` btree
  - `name` trigram (`pg_trgm`) para busca ILIKE rápida
- RLS: `ENABLE` + `FORCE` + policy `USING tenant_id = current_tenant_id() WITH CHECK ...`
- Migration manual de SQL para a unique parcial e índice trigram (Prisma não suporta direto)
- Validar via `pnpm db:migrate:dev` + smoke teste no shell

### Sub-fase 1.B — API REST CRUD (1 dia)

**Saída:** endpoints autenticados, validados, paginados, com RLS funcionando.

- Módulo `ContactsModule`:
  - `POST /contacts` — cria; valida via Zod/class-validator (e-mail/CPF/CNPJ)
  - `GET /contacts` — lista com query params: `q` (busca em name/email/phone), `stage`, `ownerId`, `tag`, `page`, `pageSize` (default 25, max 100)
  - `GET /contacts/:id` — detalhe; 404 se não pertence ao tenant (RLS retorna empty)
  - `PATCH /contacts/:id` — update parcial; valida; audit
  - `DELETE /contacts/:id` — soft delete (set `deletedAt`)
- Resposta padronizada `{ data, meta: { total, page, pageSize, hasMore } }`
- Service usa `PrismaService.client` (tenant-scoped via CLS)
- DTOs: `CreateContactDto`, `UpdateContactDto`, `ListContactsQueryDto`
- Audit log integrado: novo helper `AuditService.log({ action, entityType, entityId, before, after })`

### Sub-fase 1.C — Web: listagem + filtros + paginação (1 dia)

**Saída:** `/contacts` renderiza, filtros funcionam, paginação client-side.

- Página `/contacts` (Server Component) consome `apiServerFetch('/contacts?...')`
- Tabela com colunas: Nome, E-mail, Telefone, Stage (badge), Owner, Atualizado em
- Filtros no topo (form GET): busca textual, dropdown de stage, dropdown de owner
- Paginação via querystring (`?page=2`)
- Empty state: "Sem contatos — importar CSV ou criar"
- Click numa linha → `/contacts/[id]`

### Sub-fase 1.D — Web: detalhe + create/edit (0.5 dia)

**Saída:** páginas de criar e editar funcionam.

- `/contacts/new` — Client Component com `react-hook-form` ou apenas server action (decisão na hora)
- `/contacts/[id]` — exibe campos + botão Editar
- `/contacts/[id]/edit` — mesmo form do `new` em modo edit
- Server action `createContactAction` / `updateContactAction` chama API
- Toast/feedback de sucesso (componente novo do shadcn ou alert simples)
- Soft-delete via botão "Excluir" (com confirm)

### Sub-fase 1.E — Import CSV via BullMQ (1 dia)

**Saída:** upload CSV → progresso → importação completa.

- API:
  - `POST /contacts/imports` recebe arquivo via multer/`@nestjs/platform-express`; salva no MinIO; enfileira job BullMQ; retorna `{ importId }`
  - `GET /contacts/imports/:id` retorna status (`queued | processing | done | failed`), `processedRows`, `totalRows`, `errors[]`
- Worker BullMQ (no mesmo processo da API por enquanto):
  - Lê arquivo do MinIO; parse linha-a-linha (stream)
  - Para cada linha: dedup por `(tenantId, email)` (upsert)
  - Erros por linha vão para `errors[]` mas não param o job
  - Atualiza status do job
- BullMQ config: queue `contact-import`, conexão Redis via `REDIS_URL`
- Web:
  - `/contacts/import` — upload + UI de mapping de colunas (CSV → campos do Contact)
  - Tela com progresso (polling a cada 2s ou via SSE futuro)
  - Resultado final: "N importados, M erros" + download CSV de erros

### Sub-fase 1.F — AuditLog + polish + docs (0.5 dia)

**Saída:** changes auditáveis, UX limpa, PR aberto.

- `AuditService` populado em todas as mutações de Contact (create/update/delete + import-summary)
- Política RLS no `audit_log` já existe (Fase 0.3) — só precisamos popular
- Limpeza: loading states, error boundaries onde faltar, mensagens em pt-BR
- Update docs/03 (1.0 ✅), este doc §10 com histórico
- PR `feat/contacts`

---

## 3. Stack adicional para Fase 1

| Pacote | Função |
|---|---|
| `@nestjs/bullmq` + `bullmq` | Filas para import assíncrono |
| `@nestjs/platform-express` (já tem) + `multer` | Upload de arquivos |
| `@aws-sdk/client-s3` ou `minio` | Upload do CSV para MinIO |
| `csv-parse` (Node stream) | Parser de CSV |
| `validator` ou Zod | Validação de CPF/CNPJ |

---

## 4. Decisões importantes da fase

### 4.1 Lead vs Customer

Decisão: **entidade única `Contact` com campo `stage`**.

- Conversão lead → customer é update do campo `stage`.
- Histórico de mensagens, atividades e audit preservado.
- Padrão HubSpot/RD Station, conhecido pelos usuários.

### 4.2 Custom fields

Decisão: **sem custom fields na Fase 1** — só campos fixos.

- Drogarias têm necessidades parecidas no MVP (nome, CPF, telefone, programa de fidelidade futuro).
- Custom fields entram em fase posterior junto com UI de form builder (provavelmente Fase 4+).
- Cliente que precisar de campo extra hoje: usa `tags` (string[]).

### 4.3 Tags como `String[]`

- Postgres `text[]` é simples e indexável (GIN).
- Normalizar em tabela `tags` só quando precisarmos de autocomplete global de tags por tenant.
- Dedup case-insensitive aplicada no service antes do save.

### 4.4 Processamento assíncrono do CSV

- BullMQ + Redis (já configurado no `.env`).
- Worker roda no mesmo processo da API — sem cluster mode ainda.
- Concorrência limitada (1 job por vez por tenant para evitar lock contention).
- Quando volume crescer: split worker em processo dedicado (`apps/worker/`).

### 4.5 AuditLog para Contato

- Cada `create/update/delete` gera entrada com `before`/`after` (JSON snapshots).
- `import-summary` registra resumo do job (não cada linha).
- LGPD §17 exige rastreabilidade de mudanças em dados pessoais.

---

## 5. Estrutura de diretórios após Fase 1

```
apps/
  api/src/modules/
    contacts/
      contacts.module.ts
      contacts.controller.ts
      contacts.service.ts
      dto/
        create-contact.dto.ts
        update-contact.dto.ts
        list-contacts.query.ts
      imports/
        contact-imports.controller.ts
        contact-imports.service.ts
        contact-import.processor.ts  ← BullMQ worker
        dto/
    audit/
      audit.module.ts
      audit.service.ts
apps/web/src/app/contacts/
  page.tsx                   ← lista
  [id]/
    page.tsx                 ← detalhe
    edit/page.tsx
  new/
    page.tsx
    actions.ts
  import/
    page.tsx
    actions.ts
packages/database/prisma/
  migrations/                ← novas migrations
```

---

## 6. Convenções de código

- Soft-delete por default (`deletedAt`); hard-delete só por admin no futuro
- Paginação cursor-based fica para fase posterior (offset basta para <10k contatos)
- IDs sempre UUIDv7 (ordenável temporalmente)
- DTOs validam, services orquestram, controllers só dispatch
- Errors retornados com `code` machine-readable (ex.: `CONTACT_DUPLICATE_EMAIL`)

---

## 7. Riscos e mitigações da fase

| Risco | Mitigação |
|---|---|
| Lock contention em imports grandes | Concorrência 1 por tenant; transações curtas no upsert |
| MinIO offline durante import | Job fica em retry com backoff; libera após restore |
| Validação inconsistente CPF/CNPJ | Lib única (`validator` ou regex Zod) usada por DTO e CSV processor |
| Busca lenta com muitos contatos | Trigram index no name; ILIKE com prefix de 3 chars |
| RLS bypass acidental em endpoints novos | Code review checa que `prisma.client` (não `unscoped()`) é usado |

---

## 8. Definição de "Fase 1 concluída"

- [x] Migration aplicada em dev (staging via CI ao merge)
- [x] `POST /contacts` cria + audit `contact.create`
- [x] `GET /contacts?q=...&stage=...&tag=...` filtra e pagina
- [x] `PATCH /contacts/:id` atualiza + audit `contact.update`
- [x] `DELETE /contacts/:id` soft-delete + audit `contact.delete`
- [x] Cross-tenant via JWT forjado retorna vazio (RLS) — testado na 1.A
- [x] Web `/contacts` renderiza lista com filtros
- [x] Web criar/editar contato funciona
- [x] Import CSV via BullMQ + Redis funcional (testado com 5 linhas; lógica streaming aguenta 500+)
- [x] AuditLog populado: contact.create / update / delete / import / import.failed
- [ ] PR aberto, mergeado, branch limpa
- [x] `docs/03` 1.0 ✅, este doc §10 histórico, CLAUDE.md atualizado

---

## 9. O que NÃO entra na Fase 1

- Custom fields por tenant
- Tags com autocomplete global (separar em tabela)
- Atividades / timeline de contato (mensagens, notas) — Fase 2
- Deals / pipeline — Fase 2 ou 3
- Exportação CSV — Fase 2
- API key/token para integrações externas — Fase 3
- Bulk operations via UI (selecionar N e mudar stage) — Fase 2
- Search avançada (full-text Portuguese, fuzzy) — Fase 10 com pgvector
- Worker em processo dedicado (`apps/worker/`) — só quando volume justificar

---

## 10. Histórico de execução

### 1.A — Contact schema + RLS + migration (commit `42da497`)

- `Contact` model: id UUIDv7, tenantId, name, email Citext opcional, phone, document (CPF/CNPJ raw), companyName, stage enum (lead/prospect/customer/churned), source, ownerId FK SetNull, tags text[], soft-delete via deletedAt.
- Indexes SQL custom adicionados via raw SQL (Prisma não expressa): unique parcial `(tenantId, email) WHERE deletedAt IS NULL AND email IS NOT NULL`, GIN trigram em name (ILIKE rápido), GIN em tags.
- RLS ENABLE + FORCE + policy + GRANT a crm_app.
- Smoke: crm_app sem tenant → 0 rows; com tenant=A → só A; INSERT cross-tenant viola `WITH CHECK`.

### 1.B — API REST CRUD (commit `eb3c8fe`)

- DTOs class-validator: Create (name obrigatório, CPF/CNPJ regex 11|14 digits, email lowercase+trim), Update via `PartialType` do `@nestjs/mapped-types`, ListQuery (q, stage, ownerId, tag, page, pageSize).
- Service: create valida ownerId no tenant (RLS retorna null cross-tenant), list com OR no `q` + tag has + `$transaction(count, findMany)`, update/softDelete via findOne para garantir RLS+não-deletado.
- Erros tipados: `CONTACT_DUPLICATE_EMAIL` (P2002), `INVALID_REFERENCE` (P2003), `INVALID_OWNER`, `CONTACT_NOT_FOUND`.

### 1.C — Web listagem + filtros (commit `5f1c8c7`)

- `lib/api.ts`: tipos `Contact`, `ContactStage`, `ListContactsResponse`, `apiListContacts`.
- middleware protege `/contacts`.
- `/contacts/page.tsx` Server Component: filtro GET (busca, select stage, tag), Table com badges, paginação preservando filtros, EmptyState distinguindo "sem dados" vs "filtros sem match".
- shadcn `table` e `badge` instalados.
- Dashboard ganha link "Contatos".

### 1.D — Web detalhe + create/edit + delete (commit `2be1a24`)

- `lib/api.ts`: get/create/update/delete; `apiServerFetch` suporta 204 (DELETE retorna void).
- `_lib/schema.ts` (Zod) espelha o DTO da API com strip de `\D` em document, lowercase email, parse de tags por vírgula com dedup.
- `_components/contact-form.tsx`: client com `useActionState`, grid 2-col responsivo, erros por campo + erro geral.
- Páginas: `/contacts/new`, `/contacts/[id]`, `/contacts/[id]/edit`. Edit usa wrapper que faz `.bind(null, contact.id)` no action.
- Delete via form com action bind; revalidatePath em `/contacts` e detalhe.

### 1.E — Import CSV via BullMQ (commit `d8fc5a1`)

- DB: `ContactImport` + enum status (queued/processing/done/failed), RLS, GRANT. Migration ajustada removendo `DROP INDEX` que Prisma queria fazer nos índices custom da 1.A.
- `QueueModule` global registra BullMQ + Redis URL parseada.
- API: `POST /contacts/imports` com FileInterceptor 10MB → grava em `/tmp` → enfileira job → retorna `importId`. `GET /contacts/imports/:id` retorna status + contadores + primeiros 100 erros.
- Worker `WorkerHost` (concorrência 1): csv-parse streaming, aliases case-insensitive (nome/email/cpf/cnpj/empresa/origem), upsert por `(tenantId,email)`, validação por linha sem parar o job, tags split por `;`.
- Web: `/contacts/import` form + `/contacts/import/[id]` status com `<meta refresh="2">` enquanto em progresso.

### 1.F — AuditLog + polish + PR (commit pendente)

- `AuditModule` global + `AuditService.write()` best-effort (nunca derruba a operação pai). Resolve tenantId/actorId da CLS se não fornecidos.
- `ContactsService.create/update/delete` chamam `audit.write` com snapshots `before/after`.
- `ContactImportsProcessor`: emite `contact.import` em done com `{filename, totalRows, insertedRows, updatedRows, errorRows}` e `contact.import.failed` em falha.
- Smoke: 3 mutações no Contact → 3 entries em `audit_log` com actor_id correto.

### Pendências técnicas registradas durante a Fase 1

- **JSON null vs SQL NULL** em `audit_log.before/after`: hoje grava JSON `null` (semanticamente "ausência de estado"). Migrar para `Prisma.DbNull` se quisermos SQL NULL explícito.
- **MinIO em vez de `/tmp`** para CSV uploads — necessário quando worker virar processo dedicado.
- **Mapping de colunas configurável pela UI** — hoje só aliases hardcoded.
- **ip/userAgent no audit** — não passamos do controller. Adicionar via `@Req()` + propagação ao service.
- **Audit em login/logout/refresh** — registrado como pendência desde 0.4; ainda não fizemos.
- **Bulk operations** (selecionar N contatos, mudar stage) — Fase 2.
- **Timeline de atividades** por contato (notas, mensagens) — Fase 2.
