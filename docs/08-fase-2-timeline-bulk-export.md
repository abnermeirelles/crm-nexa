# 08 — Fase 2: Timeline + Bulk ops + Export CSV

> **Duração estimada:** 4 a 5 dias (solo dev)
> **Pré-requisitos:** Fase 1 concluída (Contacts + Import + Audit).
> **Última atualização:** 2026-05-13
> **Status:** Pendente — não iniciada

> **Nota de escopo:** Fase 2 originalmente incluía Deals/Pipeline. Esse bloco foi extraído para [`docs/09-fase-2-1-deals.md`](09-fase-2-1-deals.md) (a criar) porque é uma vertical nova com modelo+UI próprios — separar reduz risco e permite shipar Fase 2.0 em 1 semana.

---

## 1. Objetivo

No fim da Fase 2.0:

- ✅ **Timeline/Atividades** por contato: notas manuais, registros de chamadas, log de mudanças de stage. Visível na página de detalhe.
- ✅ **Bulk operations** na listagem: selecionar N contatos → mudar stage / aplicar tag / definir owner.
- ✅ **Export CSV** dos contatos filtrados (respeita filtros aplicados em `/contacts`).
- ✅ AuditLog populado em criar/editar/excluir atividade + bulk ops + export.

**Critério de "feito":**

```
1. Detalhe do contato mostra timeline com 3 tipos: nota, call, system
2. Botão "Adicionar nota" abre form → cria atividade
3. Editar contato → muda stage → system entry "stage: lead → customer"
4. /contacts → selecionar 3 linhas → "Mudar stage" → todos atualizam
5. /contacts → "Exportar CSV" baixa file com colunas canônicas
6. audit_log tem entries activity.create, contact.bulk.update, contact.export
```

---

## 2. Sub-fases

### Sub-fase 2.A — Activity model + RLS + Prisma (0.5 dia)

**Saída:** modelo `Activity` no banco, RLS, Prisma client gerado.

- `Activity`:
  - `id` UUIDv7
  - `tenantId` FK
  - `contactId` FK (cascade on delete? não — soft-delete só. Restrict.)
  - `type` enum: `note | call | email | meeting | system`
  - `title` (max 255, opcional para `system`)
  - `body` (text, opcional)
  - `metadata` jsonb (livre: ex.: `{ phoneNumber, durationSec }` para call; `{ from, to }` para stage change)
  - `actorId` FK User (opcional — `system` activities têm null)
  - `createdAt` timestamptz
  - `deletedAt` timestamptz (soft-delete)
- Indexes: `(tenantId, contactId, createdAt DESC)` para timeline; `(tenantId, type)` para filtros futuros
- RLS + GRANT a `crm_app`
- Trigger updated_at? Não — activities são append-only (edição rara, mas permitida)

### Sub-fase 2.B — API REST de atividades (1 dia)

**Saída:** endpoints autenticados, integração com ContactsService.

- Módulo `ActivitiesModule`:
  - `POST /contacts/:contactId/activities` — cria atividade manual (note/call/email/meeting)
  - `GET /contacts/:contactId/activities` — lista paginada (mais recente primeiro)
  - `PATCH /activities/:id` — edita title/body/metadata (não permite mudar type)
  - `DELETE /activities/:id` — soft-delete
- `ContactsService.update` agora também cria `Activity` tipo `system` quando `stage` muda (sem chamar audit duplicado — system activity é o canal de visibilidade pro usuário, audit é técnico).
- DTOs Zod + class-validator
- AuditLog: `activity.create / update / delete`

### Sub-fase 2.C — Web: timeline na página de detalhe (1 dia)

**Saída:** `/contacts/[id]` mostra timeline + form "Adicionar nota".

- Section "Atividades" na CardContent do detalhe
- Lista cronológica reversa com ícone por type (Note / Phone / Mail / Calendar / Cog para system)
- Form inline para adicionar nota (textarea + botão); call/email/meeting podem entrar em fase posterior se ficar pesado
- Edit/delete inline em hover para notes próprias
- Server Action `addActivityAction`

### Sub-fase 2.D — Bulk operations (1 dia)

**Saída:** UI de seleção múltipla + endpoints de bulk.

- API:
  - `POST /contacts/bulk/stage` body `{ ids: string[], stage: ContactStage }`
  - `POST /contacts/bulk/owner` body `{ ids: string[], ownerId: string }`
  - `POST /contacts/bulk/tags` body `{ ids: string[], tags: string[], mode: 'add' | 'remove' | 'replace' }`
  - Cada um valida ownership no tenant e processa em transação
  - Limite de 500 ids por request (rejeita acima — usuário deve filtrar mais)
  - AuditLog: `contact.bulk.stage / owner / tags` com `{ ids, params }` no `after`
- Web:
  - Checkbox por linha + master no header (apenas linhas visíveis)
  - Bar de ações flutuante quando há seleção: "Mudar stage" / "Definir owner" / "Aplicar tags"
  - Diálogo simples (shadcn `dialog`) com select + botão "Aplicar"
  - Após sucesso: revalidate + reset selection

### Sub-fase 2.E — Export CSV (0.5 dia)

**Saída:** botão "Exportar CSV" na listagem que respeita filtros.

- API:
  - `GET /contacts/export` retorna `text/csv` com mesma query string da listagem (q, stage, tag, ownerId)
  - Sem paginação — streaming (até 10k contatos sem timeout)
  - Colunas canônicas iguais às do import: name, email, phone, document, companyName, stage, source, tags (separadas por `;`)
  - Header `Content-Disposition: attachment; filename="contacts-YYYYMMDD.csv"`
  - AuditLog: `contact.export` com `{ filterApplied, rowsExported }`
- Web:
  - Link "Exportar CSV" no header de `/contacts` ao lado de "Importar CSV"
  - href passa querystring atual

### Sub-fase 2.F — Polish + docs + PR (0.5 dia)

- Loading states nos diálogos de bulk
- Empty state da timeline
- `docs/03` marca Fase 2.0 ✅
- Este doc §10 histórico
- CLAUDE.md atualizado
- PR `feat/timeline-bulk-export`

---

## 3. Stack adicional para Fase 2.0

| Pacote | Função |
|---|---|
| `@radix-ui/react-dialog` (via shadcn `dialog`) | Modais de bulk |
| `lucide-react` (já temos) | Ícones de tipo de activity |
| (nenhum dep novo de backend) | csv-stringify para export — já temos `csv-parse`, mas escrever CSV é mais simples manualmente |

---

## 4. Decisões importantes da fase

### 4.1 Activity como mecanismo de visibilidade vs AuditLog

- **AuditLog** é técnico/legal (LGPD §17): rastreabilidade não-visível ao usuário, append-only forçado por trigger.
- **Activity** é UX: o que aparece na timeline do contato pro vendedor ver o histórico.
- Stage change emite os dois: activity `system` (visível) + audit (técnico).
- Note manual emite apenas activity (não tem ação de mutation pra auditar além da criação da activity em si — opcional).

### 4.2 Bulk: transação por endpoint, não worker

- Até 500 ids cabe em uma transação curta sem timeout (Postgres aguenta tranquilamente).
- Acima, virar job assíncrono igual ao import. Pós-MVP.

### 4.3 Export: streaming server-side, não worker

- Filtros + 10k rows em um SELECT com cursor cabe em <5s sem worker.
- Acima de 10k, virar job + email com link (pós-MVP).

### 4.4 Activity sem `tags` ou `mentions` por enquanto

- Adicionar quando tivermos colaboração multi-user mais ativa. Hoje cada tenant tem 1-3 users.

---

## 5. Estrutura de diretórios após Fase 2.0

```
apps/api/src/modules/
  activities/
    activities.module.ts
    activities.controller.ts
    activities.service.ts
    dto/
  contacts/
    bulk/
      bulk.controller.ts
      bulk.service.ts
    export/
      export.controller.ts
apps/web/src/app/contacts/
  [id]/
    _components/
      timeline.tsx
      add-activity-form.tsx
  _components/
    bulk-actions-bar.tsx
    contact-row-checkbox.tsx
packages/database/prisma/
  migrations/
    <timestamp>_add_activities/
```

---

## 6. Convenções de código

- Activity `body` é texto simples por enquanto — markdown vai entrar quando tivermos editor decente.
- Timeline carrega 50 mais recentes por default; "Carregar mais" via cursor-based pagination (pós-MVP — usuários pioneiros raramente ultrapassam 50).
- Bulk operations sempre transacionais — falha em 1 linha = rollback do batch (decisão simples; alternativa "best-effort com erros" se virar problema).

---

## 7. Riscos e mitigações da fase

| Risco | Mitigação |
|---|---|
| Stage-change emite system activity + audit, dobrando volume | Aceitar — são canais diferentes; visibilidade ao user vale o write extra |
| Bulk de 500 ids derruba conexões em paralelo | Concurrency 1 transação; queries paramétricas, sem N+1 |
| Export grande trava o response | Streaming response (não acumula em memória), limit 10k duro |
| Timeline com 10k notas no contato | Pagination cursor-based; default 50 |
| Bulk owner cross-tenant | Validar ownerId via PrismaService.client (tenant-scoped) antes de executar |

---

## 8. Definição de "Fase 2.0 concluída"

- [ ] Migration `add_activities` aplicada
- [ ] `POST /contacts/:contactId/activities` cria nota
- [ ] `GET /contacts/:contactId/activities` lista paginada
- [ ] Mudança de stage gera activity `system`
- [ ] Web `/contacts/[id]` mostra timeline + form "Adicionar nota"
- [ ] Web `/contacts` permite seleção múltipla + mudar stage em bulk
- [ ] `GET /contacts/export` retorna CSV com filtros aplicados
- [ ] AuditLog populado em todas as ações novas
- [ ] PR aberto, mergeado, branch limpa
- [ ] `docs/03` Fase 2.0 ✅, este doc §10 histórico, CLAUDE.md atualizado

---

## 9. O que NÃO entra na Fase 2.0

- **Deals/Pipeline** — vai pra Fase 2.1 (`docs/09`)
- Editor rich text de notas (markdown/wysiwyg)
- Comentários/menções em atividades
- Filtro de timeline por tipo
- Bulk delete (perigoso sem confirmação dupla — virá com cuidado)
- Export Excel/XLSX — só CSV
- Email/SMS automático ao criar activity — Fase 3+ com motor de automação
- Cursor pagination na listagem de contatos — offset basta
- Notas privadas (apenas o autor vê) — pós-MVP
