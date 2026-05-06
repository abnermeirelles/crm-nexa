# 02 — Modelo de Dados

> **Projeto:** CRM Nexa
> **Banco:** PostgreSQL 17 + pgvector
> **ORM:** Prisma 5
> **Versão deste documento:** 1.0 (rascunho inicial)
> **Última atualização:** 2026-05-02
> **Status:** Em definição — sujeito a revisão antes do início da Fase 0

---

## 1. Princípios de Modelagem

1. **Toda tabela de domínio tem `tenant_id UUID NOT NULL`** + índice. Sem exceção.
2. **Row-Level Security (RLS)** ativo em toda tabela de domínio. Defesa em profundidade contra bug de aplicação.
3. **UUIDs (v7)** como chave primária — ordenáveis no tempo, não vazam contagem, e bons para sharding futuro. Coluna `id UUID DEFAULT uuid_generate_v7()`.
4. **`created_at` e `updated_at`** em toda tabela; `deleted_at` para soft delete onde aplicável.
5. **JSONB para dados realmente flexíveis** (campos personalizados, payloads de evento). Nunca para dados que vão ser filtrados em massa.
6. **Sem ON DELETE CASCADE entre tenants** — qualquer cascata é dentro do mesmo tenant; nunca atravessa fronteiras.
7. **Auditoria por padrão** em entidades sensíveis (consentimento, exportação, exclusão).
8. **Nomes em inglês, snake_case.** Padrão do ecossistema. Consistente com Prisma.
9. **Soft delete** preferencial; hard delete só sob solicitação LGPD (job agendado).

---

## 2. Estratégia Multi-Tenant — Detalhe Técnico

### 2.1 Convenção de RLS

Toda tabela de domínio recebe:

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabela> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabela>
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

A aplicação injeta o tenant na sessão Postgres no início de cada transação:

```sql
SET LOCAL app.current_tenant_id = '<uuid-do-tenant>';
```

Operações administrativas globais (cross-tenant, ex.: cobrança, métricas internas) usam role `admin_role` com `BYPASSRLS`.

### 2.2 Convenção de índices

- `(tenant_id, <coluna_principal>)` — todo índice usado em filtros começa com `tenant_id`.
- Índices parciais para `deleted_at IS NULL` quando o filtro é constante.
- `pg_trgm` GIN em `email`, `nome`, `phone` para busca fuzzy.

---

## 3. Entidades-Núcleo

> Visão por área. Para cada tabela: propósito → colunas-chave → índices → notas.

### 3.1 Identidade e Tenancy

#### `tenants`

Empresa cliente do SaaS.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `slug` | VARCHAR(64) | UNIQUE — usado no subdomínio |
| `name` | VARCHAR(255) | |
| `plan` | VARCHAR(32) | `starter`, `pro`, `enterprise` |
| `status` | VARCHAR(32) | `active`, `suspended`, `cancelled` |
| `limits` | JSONB | `{contacts_max, emails_per_month, ...}` |
| `dpo_email` | VARCHAR(255) | LGPD |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ | |

**Índices:** `slug` (UNIQUE), `status`.
**RLS:** desativado (tabela administrativa).

#### `users`

Usuários do sistema. Um usuário pertence a um tenant.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → tenants |
| `email` | VARCHAR(255) | UNIQUE por tenant |
| `password_hash` | TEXT | argon2id |
| `name` | VARCHAR(255) | |
| `role` | VARCHAR(32) | `owner`, `admin`, `manager`, `agent`, `viewer` |
| `mfa_secret` | TEXT | criptografado; null se MFA desativado |
| `last_login_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, email)` UNIQUE, `(tenant_id, role)`.
**RLS:** ativo.

#### `user_sessions`

Refresh tokens ativos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `tenant_id` | UUID | redundante para RLS |
| `refresh_token_hash` | TEXT | |
| `ip` | INET | |
| `user_agent` | TEXT | |
| `expires_at` | TIMESTAMPTZ | |
| `revoked_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

---

### 3.2 Contatos e Segmentação

#### `contacts`

Coração do CRM. Otimizada para escala (até 1M por tenant).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK |
| `external_id` | VARCHAR(128) | id no sistema do cliente; UNIQUE por tenant quando presente |
| `email` | VARCHAR(320) | normalizado (lowercase, trim) |
| `phone_e164` | VARCHAR(20) | telefone em formato E.164 (`+5511999998888`) |
| `first_name` | VARCHAR(120) | |
| `last_name` | VARCHAR(120) | |
| `birthdate` | DATE | |
| `gender` | VARCHAR(16) | |
| `country`, `state`, `city` | VARCHAR | |
| `custom_fields` | JSONB | valores dos campos personalizados |
| `consent_email` | BOOLEAN | opt-in marketing e-mail |
| `consent_sms` | BOOLEAN | opt-in SMS |
| `consent_whatsapp` | BOOLEAN | opt-in WhatsApp |
| `consent_updated_at` | TIMESTAMPTZ | |
| `source` | VARCHAR(64) | `csv_import`, `webhook`, `manual`, `api` |
| `lifecycle_stage` | VARCHAR(32) | `lead`, `mql`, `sql`, `customer`, `evangelist` |
| `score` | INTEGER | lead score (0-100), recalculado |
| `last_activity_at` | TIMESTAMPTZ | atualizado por evento |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:**
- `(tenant_id, email)` — busca direta
- `(tenant_id, phone_e164)` — busca direta
- `(tenant_id, external_id)` UNIQUE quando NOT NULL — para idempotência
- `(tenant_id, last_activity_at DESC)` — listagens recentes
- `(tenant_id, lifecycle_stage)`
- GIN em `custom_fields` (apenas se necessário; avaliar)
- GIN trigram em `email`, `first_name`, `last_name` para busca fuzzy
- Parcial: `WHERE deleted_at IS NULL` em todos os acima

**Particionamento:** se algum tenant ultrapassar 5M contatos, considerar particionamento por `tenant_id` via lista. **Não fazer no MVP** — over-engineering.

#### `custom_field_definitions`

Define quais campos personalizados o tenant criou.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | |
| `entity` | VARCHAR(32) | `contact`, `deal`, `company` |
| `key` | VARCHAR(64) | chave usada no JSONB (snake_case) |
| `label` | VARCHAR(120) | rótulo na UI |
| `type` | VARCHAR(16) | `text`, `number`, `date`, `boolean`, `select`, `multiselect` |
| `options` | JSONB | para `select`/`multiselect` |
| `required` | BOOLEAN | |
| `unique` | BOOLEAN | aplicado por validação na app |
| `position` | INTEGER | ordem na UI |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, entity, key)` UNIQUE.

#### `tags`

Etiquetas livres para agrupar contatos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | |
| `name` | VARCHAR(64) | |
| `color` | VARCHAR(16) | hex |
| `created_at`, `updated_at` | | |

**Índices:** `(tenant_id, name)` UNIQUE.

#### `contact_tags`

N:N entre contatos e tags.

| Coluna | Tipo |
|---|---|
| `contact_id` | UUID |
| `tag_id` | UUID |
| `tenant_id` | UUID |
| `created_at` | TIMESTAMPTZ |

**PK composta:** `(contact_id, tag_id)`.
**Índice extra:** `(tenant_id, tag_id, contact_id)` para listagem por tag.

#### `segments`

Segmentos dinâmicos: definidos por filtro, materializados sob demanda.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | |
| `name` | VARCHAR(120) | |
| `description` | TEXT | |
| `filter` | JSONB | árvore de critérios (ver 3.2.1) |
| `count_cached` | INTEGER | última contagem calculada |
| `count_calculated_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, name)`.

##### 3.2.1 Estrutura do filtro de segmento

```json
{
  "operator": "and",
  "rules": [
    {"field": "lifecycle_stage", "op": "eq", "value": "lead"},
    {
      "operator": "or",
      "rules": [
        {"field": "tag", "op": "has", "value": "<tag_id>"},
        {"field": "custom.cidade", "op": "eq", "value": "São Paulo"}
      ]
    }
  ]
}
```

Compilado para SQL parametrizado em runtime. Validado por schema Zod no service.

---

### 3.3 Pipeline / Funil de Vendas (Kanban)

#### `pipelines`

| Coluna | Tipo |
|---|---|
| `id` | UUID |
| `tenant_id` | UUID |
| `name` | VARCHAR(120) |
| `is_default` | BOOLEAN |
| `created_at`, `updated_at`, `deleted_at` | |

#### `pipeline_stages`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `pipeline_id` | UUID | |
| `name` | VARCHAR(120) | |
| `position` | INTEGER | ordenação |
| `probability` | NUMERIC(5,2) | % de fechamento estimada |
| `color` | VARCHAR(16) | |
| `is_won`, `is_lost` | BOOLEAN | etapas terminais |

**Índices:** `(tenant_id, pipeline_id, position)`.

#### `deals`

Oportunidade/negociação.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `pipeline_id` | UUID | |
| `stage_id` | UUID | |
| `contact_id` | UUID | |
| `assigned_to` | UUID | FK users — vendedor responsável |
| `title` | VARCHAR(255) | |
| `value` | NUMERIC(12,2) | |
| `currency` | CHAR(3) | ISO 4217, default `BRL` |
| `expected_close_at` | DATE | |
| `closed_at` | TIMESTAMPTZ | |
| `close_reason` | VARCHAR(120) | quando perdido |
| `custom_fields` | JSONB | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:**
- `(tenant_id, stage_id, position)` — para Kanban
- `(tenant_id, assigned_to, closed_at)` — produtividade
- `(tenant_id, contact_id)` — histórico do contato

---

### 3.4 Integrações e Credenciais

#### `integrations`

Credenciais por tenant para provedores externos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `provider` | VARCHAR(32) | `sendgrid`, `comtele`, `whatsapp_cloud`, `meta_graph`, `evolution`, `cresce_vendas` |
| `name` | VARCHAR(120) | rótulo do tenant ("Conta principal SendGrid") |
| `credentials_encrypted` | BYTEA | AES-256-GCM |
| `credentials_iv` | BYTEA | vetor de inicialização |
| `config` | JSONB | configs não-sensíveis (sender domain, número, etc.) |
| `status` | VARCHAR(32) | `active`, `error`, `disconnected` |
| `last_check_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, provider)` — múltiplas contas por provedor permitidas via `name`.

---

### 3.5 Campanhas

#### `campaigns`

Campanha multi-canal (e-mail, SMS, WhatsApp).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `channel` | VARCHAR(16) | `email`, `sms`, `whatsapp` |
| `name` | VARCHAR(255) | |
| `status` | VARCHAR(32) | `draft`, `scheduled`, `sending`, `sent`, `paused`, `failed` |
| `integration_id` | UUID | qual conta usar |
| `template_id` | UUID | |
| `audience_type` | VARCHAR(16) | `segment`, `tag`, `list` |
| `audience_ref` | UUID | id do segment ou tag |
| `audience_size_snapshot` | INTEGER | tamanho no momento do disparo |
| `subject` | VARCHAR(500) | apenas e-mail |
| `from_name`, `from_email` | VARCHAR | apenas e-mail |
| `reply_to` | VARCHAR | |
| `body_html` | TEXT | apenas e-mail |
| `body_text` | TEXT | |
| `whatsapp_template_name` | VARCHAR(120) | apenas WhatsApp |
| `whatsapp_template_params` | JSONB | |
| `scheduled_at` | TIMESTAMPTZ | quando deve disparar |
| `started_at`, `finished_at` | TIMESTAMPTZ | |
| `created_by` | UUID | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:**
- `(tenant_id, status, scheduled_at)` — scheduler
- `(tenant_id, channel, created_at DESC)`

#### `campaign_messages`

**Uma linha por destinatário.** Esta tabela cresce muito — design crítico.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `campaign_id` | UUID | |
| `contact_id` | UUID | |
| `status` | VARCHAR(20) | `queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`, `unsubscribed` |
| `provider_message_id` | VARCHAR(255) | id no SendGrid/Comtele/WhatsApp |
| `error_code` | VARCHAR(64) | |
| `error_message` | TEXT | |
| `sent_at`, `delivered_at`, `opened_at`, `clicked_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at` | | |

**Índices:**
- `(tenant_id, campaign_id, status)` — estatísticas
- `(tenant_id, contact_id, sent_at DESC)` — timeline do contato
- `(provider_message_id)` UNIQUE quando NOT NULL — para receber webhook
- **Particionar por `created_at`** (mensal) quando passar de 50M linhas.

#### `templates`

Templates reutilizáveis de mensagem.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `channel` | VARCHAR(16) | `email`, `sms`, `whatsapp` |
| `name` | VARCHAR(255) | |
| `subject` | VARCHAR(500) | e-mail |
| `body_html`, `body_text` | TEXT | |
| `variables` | JSONB | `["first_name", "company"]` — declaradas |
| `whatsapp_template_name` | VARCHAR(120) | aprovado na Meta |
| `created_at`, `updated_at`, `deleted_at` | | |

---

### 3.6 Agenda de Postagens (Social)

#### `social_accounts`

Conta de rede social conectada.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `platform` | VARCHAR(16) | `instagram`, `facebook`, `whatsapp_status` |
| `account_external_id` | VARCHAR(255) | id na Meta |
| `account_name` | VARCHAR(255) | |
| `access_token_encrypted` | BYTEA | |
| `token_expires_at` | TIMESTAMPTZ | |
| `status` | VARCHAR(32) | |
| `created_at`, `updated_at`, `deleted_at` | | |

#### `social_posts`

Postagem agendada ou publicada.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `social_account_id` | UUID | |
| `post_type` | VARCHAR(16) | `feed`, `story`, `reel`, `whatsapp_status` |
| `caption` | TEXT | |
| `media_urls` | JSONB | array de URLs no MinIO |
| `scheduled_at` | TIMESTAMPTZ | |
| `published_at` | TIMESTAMPTZ | |
| `external_post_id` | VARCHAR(255) | id na Meta após publicação |
| `status` | VARCHAR(32) | `draft`, `scheduled`, `publishing`, `published`, `failed` |
| `error_message` | TEXT | |
| `created_by` | UUID | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, status, scheduled_at)`.

---

### 3.7 Eventos, Timeline e Automações

#### `events`

**Stream de eventos do domínio.** Alimenta timeline e dispara automações.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `entity_type` | VARCHAR(32) | `contact`, `deal`, `campaign` |
| `entity_id` | UUID | |
| `type` | VARCHAR(64) | `contact.created`, `email.opened`, `deal.stage_changed`, ... |
| `actor_type` | VARCHAR(32) | `user`, `system`, `webhook`, `provider` |
| `actor_id` | UUID | nullable |
| `payload` | JSONB | dados do evento |
| `created_at` | TIMESTAMPTZ | |

**Índices:**
- `(tenant_id, entity_type, entity_id, created_at DESC)` — timeline
- `(tenant_id, type, created_at DESC)` — relatórios de funil

**Particionar por mês** quando passar de 100M linhas.

#### `automations`

Workflow de automação executado pelo engine próprio (NestJS + BullMQ).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `name` | VARCHAR(255) | |
| `description` | TEXT | |
| `trigger_type` | VARCHAR(64) | `contact.created`, `contact.tag_added`, `contact.entered_segment`, `event.custom`, `schedule`, ... |
| `trigger_config` | JSONB | parâmetros do gatilho |
| `definition` | JSONB | DSL do workflow: nós (ações), conexões, configurações por nó (ver 3.7.1) |
| `version` | INTEGER | versão da definição; cresce a cada save |
| `published_version` | INTEGER | versão atualmente em execução |
| `status` | VARCHAR(32) | `draft`, `active`, `paused`, `error` |
| `last_executed_at` | TIMESTAMPTZ | |
| `execution_count` | INTEGER | total de runs |
| `success_count`, `failure_count` | INTEGER | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, status, trigger_type)` para o dispatcher acordar listeners.

##### 3.7.1 DSL da definição

```json
{
  "nodes": [
    {"id": "n1", "type": "trigger", "config": {"type": "contact.tag_added", "tag_id": "<uuid>"}},
    {"id": "n2", "type": "send_email", "config": {"template_id": "<uuid>"}},
    {"id": "n3", "type": "delay", "config": {"days": 3}},
    {"id": "n4", "type": "branch", "config": {"condition": {"field": "events.email_opened", "op": "exists_in_last", "days": 3}}},
    {"id": "n5", "type": "send_sms", "config": {"template_id": "<uuid>"}}
  ],
  "edges": [
    {"from": "n1", "to": "n2"},
    {"from": "n2", "to": "n3"},
    {"from": "n3", "to": "n4"},
    {"from": "n4", "to": "n5", "branch": "false"}
  ]
}
```

Ações suportadas no escopo inicial: `send_email`, `send_sms`, `send_whatsapp`, `add_tag`, `remove_tag`, `update_field`, `delay`, `branch`. **Sem loops, sub-workflows ou ações arbitrárias** — fora do escopo inicial.

#### `automation_runs`

Execução individual de um automation para uma entidade. Auditoria + retomada após falha.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `automation_id` | UUID | |
| `automation_version` | INTEGER | versão executada (importante: definição pode mudar) |
| `entity_type`, `entity_id` | | tipicamente contact |
| `current_node_id` | VARCHAR(64) | nó atual no workflow |
| `state` | JSONB | variáveis acumuladas durante o run |
| `status` | VARCHAR(20) | `running`, `waiting`, `completed`, `failed`, `cancelled` |
| `next_action_at` | TIMESTAMPTZ | quando o scheduler acorda este run (delays) |
| `started_at`, `finished_at` | TIMESTAMPTZ | |
| `error_message` | TEXT | |

**Índices:** `(tenant_id, status, next_action_at)` — scheduler escaneia este índice.

#### `automation_step_logs`

Log granular de cada passo executado (debug e auditoria).

| Coluna | Tipo |
|---|---|
| `id` | UUID |
| `tenant_id` | UUID |
| `automation_run_id` | UUID |
| `node_id` | VARCHAR(64) |
| `node_type` | VARCHAR(32) |
| `input`, `output` | JSONB |
| `status` | `success`, `failed`, `skipped` |
| `executed_at` | TIMESTAMPTZ |
| `duration_ms` | INTEGER |

---

### 3.8 Webhooks

#### `webhooks_in`

Endpoints públicos que clientes do tenant configuram em sistemas externos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `slug` | VARCHAR(64) | URL: `/in/<tenant_slug>/<slug>` |
| `secret` | TEXT | usado para HMAC verificação |
| `mapping` | JSONB | como mapear payload → contato |
| `target_action` | VARCHAR(32) | `create_contact`, `add_tag`, `update_field`, `trigger_automation` |
| `enabled` | BOOLEAN | |
| `last_received_at` | TIMESTAMPTZ | |
| `received_count` | INTEGER | |
| `created_at`, `updated_at`, `deleted_at` | | |

**Índices:** `(tenant_id, slug)` UNIQUE.

#### `webhooks_in_log`

Log de payloads recebidos (para debug do cliente).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `webhook_in_id` | UUID | |
| `payload` | JSONB | |
| `headers` | JSONB | |
| `processed` | BOOLEAN | |
| `error_message` | TEXT | |
| `received_at` | TIMESTAMPTZ | |

**TTL:** purga automática após 30 dias (job).

---

### 3.9 Auditoria e Compliance

#### `audit_log`

Toda ação sensível em compliance LGPD.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `actor_type`, `actor_id` | | |
| `action` | VARCHAR(64) | `contact.exported`, `contact.deleted`, `consent.changed`, `login.success`, `login.failed` |
| `entity_type`, `entity_id` | | |
| `before`, `after` | JSONB | snapshot do diff |
| `ip` | INET | |
| `user_agent` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

**Append-only** (sem UPDATE nem DELETE; impedido por trigger).

#### `data_subject_requests`

Solicitações LGPD de titulares.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `contact_id` | UUID | |
| `type` | VARCHAR(32) | `access`, `deletion`, `portability`, `rectification` |
| `status` | VARCHAR(32) | `pending`, `in_progress`, `completed`, `rejected` |
| `requested_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |
| `result_url` | TEXT | link MinIO assinado para download |
| `notes` | TEXT | |

---

### 3.10 Cobrança (esqueleto futuro)

Tabelas a definir na fase pós-MVP. Marcando aqui para não esquecer:

- `subscriptions` — plano vigente do tenant
- `usage_metrics` — eventos faturáveis (e-mail enviado, SMS, WhatsApp, contato armazenado)
- `invoices` — faturas
- `invoice_items` — itens

---

### 3.11 Embeddings e IA (pgvector)

> **Postgres 17 com extensão pgvector já está disponível.** Usado nas features opcionais de IA, **ativáveis por tenant** (não obrigatório).

#### `contact_embeddings`

Vetor representando o "perfil" textual do contato (nome + campos relevantes + últimas interações). Usado para busca semântica e classificação.

| Coluna | Tipo | Notas |
|---|---|---|
| `contact_id` | UUID | PK + FK |
| `tenant_id` | UUID | |
| `model` | VARCHAR(64) | identificação do modelo de embedding (ex.: `text-embedding-3-small`) |
| `dimensions` | INTEGER | dimensionalidade (1536 para OpenAI small) |
| `embedding` | vector(1536) | tipo `vector` do pgvector |
| `source_text_hash` | VARCHAR(64) | hash do texto que gerou — para invalidar quando o perfil muda |
| `generated_at` | TIMESTAMPTZ | |

**Índices:** `ivfflat` ou `hnsw` em `embedding` para ANN search. Escolher `hnsw` se memória disponível (melhor recall); `ivfflat` se restrito.

#### `template_embeddings`, `segment_embeddings` (futuro)

Mesmo padrão para sugerir templates similares e classificar segmentos.

#### Casos de uso suportados (Fase 10 — IA opcional)

- Busca semântica de contatos: "encontre contatos parecidos com este aqui"
- Sugestão de segmentação automática
- Classificação de intenção em respostas de campanha
- Deduplicação inteligente (variantes de e-mail/nome)

#### Custos e privacidade

- Embeddings gerados via OpenAI/Anthropic — credenciais por tenant em `integrations`
- **Opcional por tenant** — quem ativa, paga; quem não ativa, tabela fica vazia para aquele tenant
- Texto enviado ao provedor passa por anonimização configurável (remover e-mail e telefone) — **diferencial de privacidade vs concorrentes**

---

## 4. Diagrama de Relacionamento (alto nível)

```
tenants ─┬─< users
         ├─< contacts ──< contact_tags >── tags
         │      │
         │      ├──< deals ──> pipelines ──< pipeline_stages
         │      ├──< events
         │      └──< campaign_messages >── campaigns ──> templates
         │
         ├─< segments
         ├─< custom_field_definitions
         ├─< integrations ──< campaigns
         ├─< automations ──< automation_runs
         ├─< webhooks_in ──< webhooks_in_log
         ├─< social_accounts ──< social_posts
         └─< audit_log
```

---

## 5. Convenções Prisma

### 5.1 Esqueleto do schema

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearchPostgres"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [uuid_ossp, pg_trgm, citext, vector]
}

model Tenant {
  id        String   @id @default(uuid()) @db.Uuid
  slug      String   @unique
  name      String
  plan      String   @default("starter")
  status    String   @default("active")
  limits    Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt        @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  users    User[]
  contacts Contact[]

  @@map("tenants")
}
// ... (demais modelos seguem mesmo padrão)
```

### 5.2 Mixins comuns por convenção

Como Prisma não tem herança, cada model repete:
- `id`, `tenantId`, `createdAt`, `updatedAt`
- `deletedAt` quando aplicável
- relação para `tenant`

Para reduzir boilerplate, usamos um snippet em `packages/database/snippets.md`.

### 5.3 Migrations

- Toda migration que adiciona tabela RLS-protegida inclui as policies.
- Migrations destrutivas (DROP, ALTER incompatível) requerem revisão extra.
- Convenção de nome: `YYYYMMDDHHmm_descricao.sql`.

---

## 6. Considerações de Performance

### 6.1 Hot paths previstos

| Operação | Query | Estratégia |
|---|---|---|
| Listar contatos com filtro | Filtro dinâmico em `contacts` | Índice composto + LIMIT/OFFSET por keyset |
| Disparar campanha para segmento de 1M | Materializar IDs via segmento | Job em chunks de 10k; insere em `campaign_messages` em batch |
| Timeline de um contato | `events` por `(tenant, entity_id)` | Índice composto + partição |
| Contagem de segmento | `COUNT(*)` com filtro | Cache em `segments.count_cached` recalculado por job |
| Webhook de retorno (provider) | Lookup por `provider_message_id` | Índice UNIQUE |

### 6.2 O que NÃO otimizar agora

- Particionamento de tabelas — só quando o volume justificar (regra: passa de 50M linhas).
- Cache de leitura em Redis — só após medir; banco resolve a maior parte.
- Réplicas de leitura — só após medir saturação do primário.

---

## 7. Riscos de Modelagem

| Risco | Mitigação |
|---|---|
| Campo personalizado vira filtro pesado em JSONB | Promover para coluna real quando uso > 50% dos tenants. Migration assistida. |
| `campaign_messages` cresce sem controle | Particionamento por mês quando >50M; arquivar após 12 meses para storage frio. |
| Vazamento entre tenants por bug | RLS forçada + testes E2E que tentam o vazamento explicitamente. |
| Migration breaking em produção | Migrations sempre backward-compatible em duas etapas (deploy dual). |
| JSONB `custom_fields` sem schema | Validação por `custom_field_definitions` na app antes do INSERT/UPDATE. |

---

## 8. Próximos Passos

1. Revisão e aprovação deste documento.
2. Criar repositório com estrutura `apps/api`, `apps/web`, `packages/database`, `packages/shared`.
3. Inicializar Prisma com as primeiras tabelas (tenants, users, contacts, tags, custom_field_definitions, segments).
4. Migration inicial com RLS configurado.
5. Seed de tenant de desenvolvimento + usuário admin.

---

> **Status:** Aguardando revisão do owner.
